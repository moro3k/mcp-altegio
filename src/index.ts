import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import * as z from "zod/v4";
import { altegioGet, altegioPost, altegioPut, altegioDelete } from "./api.js";
import {
  detectSearchType,
  filterActiveStaff,
  filterByApiId,
  formatToolResponse,
  formatTextResponse,
  formatErrorResponse,
} from "./helpers.js";
import pkg from "../package.json";

export const server = new McpServer({
  name: "altegio",
  version: pkg.version,
});

// --- Записи (Records) ---

server.registerTool("get_records", {
  description:
    "Получить записи за период. Возвращает все поля: api_id, resource_instances, custom_fields, attendance, activity_id, payment_status и др.",
  inputSchema: {
    start_date: z.string().describe("Дата начала (YYYY-MM-DD)"),
    end_date: z.string().describe("Дата окончания (YYYY-MM-DD)"),
    staff_id: z.number().optional().describe("ID сотрудника"),
    client_id: z.number().optional().describe("ID клиента"),
    page: z.number().optional().default(1).describe("Страница (default 1)"),
    count: z
      .number()
      .optional()
      .default(50)
      .describe("Кол-во на страницу (default 50, max 200)"),
  },
}, async ({ start_date, end_date, staff_id, client_id, page, count }) => {
  try {
    const data = await altegioGet("/records/{company_id}", {
      start_date,
      end_date,
      staff_id,
      client_id,
      page,
      count,
    });
    return formatToolResponse(data);
  } catch (e) {
    return formatErrorResponse(e);
  }
});

server.registerTool("get_records_by_client", {
  description: "Получить все записи конкретного клиента за период",
  inputSchema: {
    client_id: z.number().describe("ID клиента"),
    start_date: z.string().describe("Дата начала (YYYY-MM-DD)"),
    end_date: z.string().describe("Дата окончания (YYYY-MM-DD)"),
    page: z.number().optional().default(1).describe("Страница (default 1)"),
    count: z
      .number()
      .optional()
      .default(50)
      .describe("Кол-во на страницу (default 50)"),
  },
}, async ({ client_id, start_date, end_date, page, count }) => {
  try {
    const data = await altegioGet("/records/{company_id}", {
      client_id,
      start_date,
      end_date,
      page,
      count,
    });
    return formatToolResponse(data);
  } catch (e) {
    return formatErrorResponse(e);
  }
});

// Поиск записей по api_id — фильтрация на стороне клиента,
// потому что Altegio API не поддерживает фильтр по api_id.
// Загружает все страницы за дату, чтобы не пропустить записи.
server.registerTool("get_records_by_visit", {
  description:
    "Найти все Altegio-записи привязанные к визиту по api_id. Загружает записи за дату и фильтрует (api_id=0 значит не привязана)",
  inputSchema: {
    api_id: z.number().describe("ID визита (число, записанное в api_id)"),
    date: z.string().describe("Дата записи (YYYY-MM-DD)"),
  },
}, async ({ api_id, date }) => {
  try {
    const allRecords: Record<string, unknown>[] = [];
    let page = 1;
    while (true) {
      const data = await altegioGet("/records/{company_id}", {
        start_date: date,
        end_date: date,
        count: 200,
        page,
      });
      const batch = Array.isArray(data) ? data : [];
      allRecords.push(...batch);
      if (batch.length < 200) break;
      page++;
    }
    const filtered = filterByApiId(allRecords, api_id);
    return filtered.length
      ? formatToolResponse(filtered)
      : formatTextResponse(`Записи с api_id=${api_id} на ${date} не найдены`);
  } catch (e) {
    return formatErrorResponse(e);
  }
});

server.registerTool("create_record", {
  description:
    "Создать запись в Altegio. seance_length в секундах! save_if_busy=true по умолчанию",
  inputSchema: {
    staff_id: z.number().describe("ID сотрудника"),
    services: z
      .array(z.object({ id: z.number() }))
      .describe("Массив услуг [{id}]"),
    client: z
      .object({
        name: z.string(),
        phone: z.string(),
        email: z.string().optional(),
      })
      .describe("Данные клиента"),
    datetime: z
      .string()
      .describe("Дата и время (YYYY-MM-DD HH:mm:ss или ISO 8601)"),
    seance_length: z
      .number()
      .describe("Длительность в СЕКУНДАХ (3600 = 1 час)"),
    // api_id только число — строки API игнорирует, записывает 0
    api_id: z
      .number()
      .optional()
      .describe("ID визита из внешней системы (только число)"),
    comment: z.string().optional().describe("Комментарий к записи"),
    attendance: z
      .number()
      .optional()
      .describe("Статус: -1=отменён, 0=ожидается, 1=подтверждён, 2=пришёл"),
    send_sms: z
      .boolean()
      .optional()
      .default(false)
      .describe("Отправлять SMS клиенту (default false)"),
    save_if_busy: z
      .boolean()
      .optional()
      .default(true)
      .describe("Создать даже при конфликте времени (default true)"),
  },
}, async (args) => {
  try {
    const data = await altegioPost("/records/{company_id}", args);
    return formatToolResponse(data);
  } catch (e) {
    return formatErrorResponse(e);
  }
});

// Высокоуровневый инструмент бронирования — автоматически ставит save_if_busy и api_id
server.registerTool("book_service", {
  description:
    "Забронировать услугу с привязкой к визиту. Автоматически ставит save_if_busy=true и api_id=visit_id",
  inputSchema: {
    visit_id: z.number().describe("ID визита (записывается в api_id)"),
    service_id: z.number().describe("ID услуги"),
    staff_id: z.number().describe("ID мастера"),
    datetime: z.string().describe("Дата и время (YYYY-MM-DD HH:mm:ss)"),
    seance_length: z
      .number()
      .describe("Длительность в СЕКУНДАХ (3600 = 1 час)"),
    client_name: z.string().describe("Имя клиента"),
    client_phone: z.string().describe("Телефон клиента"),
    comment: z.string().optional().describe("Комментарий"),
    send_sms: z
      .boolean()
      .optional()
      .default(false)
      .describe("Отправлять SMS (default false)"),
  },
}, async ({
  visit_id,
  service_id,
  staff_id,
  datetime,
  seance_length,
  client_name,
  client_phone,
  comment,
  send_sms,
}) => {
  try {
    const data = await altegioPost("/records/{company_id}", {
      staff_id,
      services: [{ id: service_id }],
      client: { name: client_name, phone: client_phone },
      datetime,
      seance_length,
      api_id: visit_id,
      comment,
      send_sms,
      save_if_busy: true,
    });
    return formatToolResponse(data);
  } catch (e) {
    return formatErrorResponse(e);
  }
});

server.registerTool("update_record", {
  description: "Изменить запись",
  inputSchema: {
    record_id: z.number().describe("ID записи"),
    staff_id: z.number().optional().describe("ID сотрудника"),
    services: z
      .array(z.object({ id: z.number() }))
      .optional()
      .describe("Массив услуг"),
    datetime: z.string().optional().describe("Новая дата/время"),
    seance_length: z
      .number()
      .optional()
      .describe("Длительность в секундах"),
    api_id: z
      .number()
      .optional()
      .describe("ID визита из внешней системы (только число)"),
    comment: z.string().optional().describe("Комментарий к записи"),
    attendance: z
      .number()
      .optional()
      .describe("Статус: -1=отменён, 0=ожидается, 1=подтверждён, 2=пришёл"),
  },
}, async ({ record_id, ...body }) => {
  try {
    if (Object.keys(body).filter((k) => body[k as keyof typeof body] !== undefined).length === 0) {
      return formatErrorResponse("Укажите хотя бы одно поле для обновления");
    }
    const data = await altegioPut(
      `/records/{company_id}/${record_id}`,
      body
    );
    return formatToolResponse(data);
  } catch (e) {
    return formatErrorResponse(e);
  }
});

server.registerTool("delete_record", {
  description: "Удалить запись",
  inputSchema: {
    record_id: z.number().describe("ID записи"),
  },
}, async ({ record_id }) => {
  try {
    const data = await altegioDelete(`/records/{company_id}/${record_id}`);
    return formatToolResponse(data);
  } catch (e) {
    return formatErrorResponse(e);
  }
});

// --- Клиенты (Clients) ---

// Автоопределение типа запроса: телефон → phone, email → email, иначе → fullname
server.registerTool("search_clients", {
  description: "Поиск клиентов по имени, телефону или email",
  inputSchema: {
    query: z.string().describe("Поисковый запрос (имя, телефон, email)"),
    page: z.number().optional().default(1).describe("Страница (default 1)"),
    count: z
      .number()
      .optional()
      .default(20)
      .describe("Кол-во на страницу (default 20)"),
  },
}, async ({ query, page, count }) => {
  try {
    const trimmed = query.trim();
    if (!trimmed) {
      return formatErrorResponse("Поисковый запрос не может быть пустым");
    }
    const { field, value } = detectSearchType(trimmed);
    const params: Record<string, unknown> = { page, count, [field]: value };
    const data = await altegioGet("/clients/{company_id}", params);
    return formatToolResponse(data);
  } catch (e) {
    return formatErrorResponse(e);
  }
});

server.registerTool("get_client", {
  description: "Получить клиента по ID",
  inputSchema: {
    client_id: z.number().describe("ID клиента"),
  },
}, async ({ client_id }) => {
  try {
    const data = await altegioGet(`/client/{company_id}/${client_id}`);
    return formatToolResponse(data);
  } catch (e) {
    return formatErrorResponse(e);
  }
});

server.registerTool("create_client", {
  description: "Создать нового клиента",
  inputSchema: {
    name: z.string().describe("Имя клиента"),
    phone: z.string().describe("Телефон"),
    email: z.string().optional().describe("Email"),
  },
}, async (args) => {
  try {
    const data = await altegioPost("/clients/{company_id}", args);
    return formatToolResponse(data);
  } catch (e) {
    return formatErrorResponse(e);
  }
});

server.registerTool("update_client", {
  description: "Редактировать клиента",
  inputSchema: {
    client_id: z.number().describe("ID клиента"),
    name: z.string().optional().describe("Имя"),
    phone: z.string().optional().describe("Телефон"),
    email: z.string().optional().describe("Email"),
  },
}, async ({ client_id, ...body }) => {
  try {
    if (Object.keys(body).filter((k) => body[k as keyof typeof body] !== undefined).length === 0) {
      return formatErrorResponse("Укажите хотя бы одно поле для обновления");
    }
    const data = await altegioPut(`/client/{company_id}/${client_id}`, body);
    return formatToolResponse(data);
  } catch (e) {
    return formatErrorResponse(e);
  }
});

// --- Услуги (Services) ---

server.registerTool("get_services", {
  description:
    "Список услуг компании. Можно отфильтровать по мастеру (staff_id) или категории",
  inputSchema: {
    staff_id: z
      .number()
      .optional()
      .describe("Показать только услуги этого мастера"),
    category_id: z.number().optional().describe("Фильтр по категории"),
    page: z.number().optional().default(1).describe("Страница (default 1)"),
    count: z
      .number()
      .optional()
      .default(50)
      .describe("Кол-во на страницу (default 50)"),
  },
}, async ({ staff_id, category_id, page, count }) => {
  try {
    const data = await altegioGet("/company/{company_id}/services", {
      staff_id,
      category_id,
      page,
      count,
    });
    return formatToolResponse(data);
  } catch (e) {
    return formatErrorResponse(e);
  }
});

server.registerTool("get_service_categories", {
  description: "Категории услуг компании",
}, async () => {
  try {
    const data = await altegioGet("/company/{company_id}/service_categories");
    return formatToolResponse(data);
  } catch (e) {
    return formatErrorResponse(e);
  }
});

// --- Сотрудники (Staff) ---

// По умолчанию фильтруем уволенных (fired=1)
server.registerTool("get_staff", {
  description:
    "Список сотрудников. По умолчанию только активные (fired=0), без уволенных",
  inputSchema: {
    active_only: z
      .boolean()
      .optional()
      .default(true)
      .describe("Только активные (не уволенные) сотрудники (default true)"),
  },
}, async ({ active_only }) => {
  try {
    const data = await altegioGet("/company/{company_id}/staff");
    if (active_only && Array.isArray(data)) {
      return formatToolResponse(filterActiveStaff(data));
    }
    return formatToolResponse(data);
  } catch (e) {
    return formatErrorResponse(e);
  }
});

server.registerTool("get_staff_member", {
  description: "Получить сотрудника по ID",
  inputSchema: {
    staff_id: z.number().describe("ID сотрудника"),
  },
}, async ({ staff_id }) => {
  try {
    const data = await altegioGet(`/staff/{company_id}/${staff_id}`);
    return formatToolResponse(data);
  } catch (e) {
    return formatErrorResponse(e);
  }
});

// --- Расписание (Schedule) ---

server.registerTool("get_available_times", {
  description: "Свободные слоты для записи на конкретную дату",
  inputSchema: {
    staff_id: z.number().describe("ID сотрудника"),
    date: z.string().describe("Дата (YYYY-MM-DD)"),
    service_ids: z
      .array(z.number())
      .optional()
      .describe("ID услуг для расчёта длительности"),
  },
}, async ({ staff_id, date, service_ids }) => {
  try {
    const params: Record<string, unknown> = {};
    if (service_ids?.length) {
      params.service_ids = service_ids.join(",");
    }
    const data = await altegioGet(
      `/book_times/{company_id}/${staff_id}/${date}`,
      params
    );
    return formatToolResponse(data);
  } catch (e) {
    return formatErrorResponse(e);
  }
});

server.registerTool("get_available_dates", {
  description: "Рабочие дни (доступные для записи)",
  inputSchema: {
    staff_id: z.number().optional().describe("ID сотрудника"),
    date_from: z.string().optional().describe("С даты (YYYY-MM-DD)"),
    date_to: z.string().optional().describe("По дату (YYYY-MM-DD)"),
  },
}, async ({ staff_id, date_from, date_to }) => {
  try {
    const data = await altegioGet("/book_dates/{company_id}", {
      staff_id,
      date_from,
      date_to,
    });
    return formatToolResponse(data);
  } catch (e) {
    return formatErrorResponse(e);
  }
});

// --- Финансы (Transactions) ---

server.registerTool("get_transactions", {
  description: "Транзакции за период",
  inputSchema: {
    start_date: z.string().describe("Дата начала (YYYY-MM-DD)"),
    end_date: z.string().describe("Дата окончания (YYYY-MM-DD)"),
    page: z.number().optional().default(1).describe("Страница (default 1)"),
    count: z
      .number()
      .optional()
      .default(50)
      .describe("Кол-во на страницу (default 50)"),
  },
}, async ({ start_date, end_date, page, count }) => {
  try {
    const data = await altegioGet("/transactions/{company_id}", {
      start_date,
      end_date,
      page,
      count,
    });
    return formatToolResponse(data);
  } catch (e) {
    return formatErrorResponse(e);
  }
});

// --- Запуск сервера ---

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

// Запуск только при прямом вызове (не при импорте в тестах)
if (import.meta.main) {
  main().catch((err) => {
    console.error("Failed to start altegio MCP server:", err);
    process.exit(1);
  });
}
