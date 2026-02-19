import { describe, it, expect, beforeAll, afterAll, beforeEach, mock } from "bun:test";

// Переопределяем env ДО любых импортов
// Bun загружает .env при старте, но getConfig() в api.ts читает env лениво
process.env.ALTEGIO_TOKEN = "test_partner_token";
process.env.ALTEGIO_USER_TOKEN = "test_user_token";
process.env.ALTEGIO_COMPANY_ID = "99999";

// Мокаем глобальный fetch для всех API-вызовов
const originalFetch = globalThis.fetch;
let fetchMock: ReturnType<typeof mock>;

function setFetchResponse(data: unknown, status = 200) {
  fetchMock = mock(() =>
    Promise.resolve(
      new Response(
        JSON.stringify({ success: true, data }),
        { status, headers: { "Content-Type": "application/json" } }
      )
    )
  );
  globalThis.fetch = fetchMock as any;
}

// Дефолтный мок — пустой ответ
setFetchResponse([]);

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { createServer } from "../src/server";

let client: Client;

// Список всех 18 инструментов
const EXPECTED_TOOLS = [
  "get_records",
  "get_records_by_client",
  "get_records_by_visit",
  "create_record",
  "book_service",
  "update_record",
  "delete_record",
  "search_clients",
  "get_client",
  "create_client",
  "update_client",
  "get_services",
  "get_service_categories",
  "get_staff",
  "get_staff_member",
  "get_available_times",
  "get_available_dates",
  "get_transactions",
];

beforeAll(async () => {
  const [clientTransport, serverTransport] =
    InMemoryTransport.createLinkedPair();
  client = new Client({ name: "test-client", version: "1.0.0" });

  const server = createServer();
  await server.connect(serverTransport);
  await client.connect(clientTransport);
});

beforeEach(() => {
  // Гарантируем тестовые env для каждого теста
  process.env.ALTEGIO_TOKEN = "test_partner_token";
  process.env.ALTEGIO_USER_TOKEN = "test_user_token";
  process.env.ALTEGIO_COMPANY_ID = "99999";
  // Дефолтный мок
  setFetchResponse([]);
});

afterAll(async () => {
  await client.close();
  globalThis.fetch = originalFetch;
});

// --- Метаданные сервера ---

describe("метаданные сервера", () => {
  it("имя сервера = altegio", () => {
    const info = client.getServerVersion();
    expect(info?.name).toBe("altegio");
  });

  it("версия сервера из package.json", async () => {
    const pkg = await import("../package.json");
    const info = client.getServerVersion();
    expect(info?.version).toBe(pkg.version);
  });
});

// --- Регистрация инструментов ---

describe("регистрация инструментов", () => {
  let toolNames: string[];

  beforeAll(async () => {
    const result = await client.listTools();
    toolNames = result.tools.map((t) => t.name);
  });

  it("зарегистрировано 18 инструментов", () => {
    expect(toolNames).toHaveLength(18);
  });

  for (const toolName of EXPECTED_TOOLS) {
    it(`инструмент "${toolName}" зарегистрирован`, () => {
      expect(toolNames).toContain(toolName);
    });
  }

  it("все инструменты имеют описание", async () => {
    const result = await client.listTools();
    for (const tool of result.tools) {
      expect(tool.description).toBeTruthy();
      expect(tool.description!.length).toBeGreaterThan(5);
    }
  });
});

// --- Схемы инструментов ---

describe("схемы инструментов", () => {
  let tools: Map<string, any>;

  beforeAll(async () => {
    const result = await client.listTools();
    tools = new Map(result.tools.map((t) => [t.name, t]));
  });

  it("get_records требует start_date и end_date", () => {
    const schema = tools.get("get_records")!.inputSchema;
    expect(schema.required).toContain("start_date");
    expect(schema.required).toContain("end_date");
  });

  it("create_record требует staff_id, services, client, datetime, seance_length", () => {
    const schema = tools.get("create_record")!.inputSchema;
    expect(schema.required).toContain("staff_id");
    expect(schema.required).toContain("services");
    expect(schema.required).toContain("client");
    expect(schema.required).toContain("datetime");
    expect(schema.required).toContain("seance_length");
  });

  it("book_service требует visit_id, service_id, staff_id", () => {
    const schema = tools.get("book_service")!.inputSchema;
    expect(schema.required).toContain("visit_id");
    expect(schema.required).toContain("service_id");
    expect(schema.required).toContain("staff_id");
  });

  it("search_clients требует query", () => {
    const schema = tools.get("search_clients")!.inputSchema;
    expect(schema.required).toContain("query");
  });

  it("get_service_categories не требует параметров", () => {
    const schema = tools.get("get_service_categories")!.inputSchema;
    const required = schema.required || [];
    expect(required).toHaveLength(0);
  });

  it("delete_record требует только record_id", () => {
    const schema = tools.get("delete_record")!.inputSchema;
    expect(schema.required).toContain("record_id");
    expect(schema.required).toHaveLength(1);
  });

  it("get_staff: active_only default=true", () => {
    const schema = tools.get("get_staff")!.inputSchema;
    expect(schema.properties.active_only).toBeDefined();
    expect(schema.properties.active_only.default).toBe(true);
  });

  it("create_record: save_if_busy default=true", () => {
    const schema = tools.get("create_record")!.inputSchema;
    expect(schema.properties.save_if_busy.default).toBe(true);
  });

  it("create_record: send_sms default=false", () => {
    const schema = tools.get("create_record")!.inputSchema;
    expect(schema.properties.send_sms.default).toBe(false);
  });

  it("get_available_times требует staff_id и date", () => {
    const schema = tools.get("get_available_times")!.inputSchema;
    expect(schema.required).toContain("staff_id");
    expect(schema.required).toContain("date");
  });

  it("get_records_by_visit требует api_id и date", () => {
    const schema = tools.get("get_records_by_visit")!.inputSchema;
    expect(schema.required).toContain("api_id");
    expect(schema.required).toContain("date");
  });

  it("get_transactions требует start_date и end_date", () => {
    const schema = tools.get("get_transactions")!.inputSchema;
    expect(schema.required).toContain("start_date");
    expect(schema.required).toContain("end_date");
  });
});

// --- Вызов инструментов ---

describe("вызов инструментов", () => {
  it("get_records возвращает JSON", async () => {
    setFetchResponse([{ id: 1, client: "Анна" }]);

    const result = await client.callTool({
      name: "get_records",
      arguments: { start_date: "2026-01-01", end_date: "2026-01-31" },
    });

    const text = (result.content as any)[0].text;
    const parsed = JSON.parse(text);
    expect(parsed).toEqual([{ id: 1, client: "Анна" }]);
  });

  it("search_clients с телефоном → phone параметр", async () => {
    setFetchResponse([{ id: 1, name: "Анна" }]);

    await client.callTool({
      name: "search_clients",
      arguments: { query: "+66812345678" },
    });

    const url = fetchMock.mock.calls[fetchMock.mock.calls.length - 1][0] as string;
    expect(url).toContain("phone=");
    expect(url).not.toContain("fullname=");
  });

  it("search_clients с email → email параметр", async () => {
    setFetchResponse([]);

    await client.callTool({
      name: "search_clients",
      arguments: { query: "test@example.com" },
    });

    const url = fetchMock.mock.calls[fetchMock.mock.calls.length - 1][0] as string;
    expect(url).toContain("email=");
  });

  it("search_clients с именем → fullname параметр", async () => {
    setFetchResponse([]);

    await client.callTool({
      name: "search_clients",
      arguments: { query: "Анна Иванова" },
    });

    const url = fetchMock.mock.calls[fetchMock.mock.calls.length - 1][0] as string;
    expect(url).toContain("fullname=");
  });

  it("get_service_categories без аргументов", async () => {
    setFetchResponse([{ id: 1, title: "Массаж" }]);

    const result = await client.callTool({
      name: "get_service_categories",
      arguments: {},
    });

    const text = (result.content as any)[0].text;
    expect(JSON.parse(text)[0].title).toBe("Массаж");
  });

  it("get_staff фильтрует уволенных по умолчанию", async () => {
    setFetchResponse([
      { id: 1, name: "Анна", fired: 0 },
      { id: 2, name: "Пётр", fired: 1 },
    ]);

    const result = await client.callTool({
      name: "get_staff",
      arguments: {},
    });

    const parsed = JSON.parse((result.content as any)[0].text);
    expect(parsed).toHaveLength(1);
    expect(parsed[0].name).toBe("Анна");
  });

  it("get_staff с active_only=false возвращает всех", async () => {
    setFetchResponse([
      { id: 1, name: "Анна", fired: 0 },
      { id: 2, name: "Пётр", fired: 1 },
    ]);

    const result = await client.callTool({
      name: "get_staff",
      arguments: { active_only: false },
    });

    const parsed = JSON.parse((result.content as any)[0].text);
    expect(parsed).toHaveLength(2);
  });

  it("get_records_by_visit фильтрует по api_id", async () => {
    setFetchResponse([
      { id: 100, api_id: 42 },
      { id: 101, api_id: 0 },
      { id: 102, api_id: 42 },
    ]);

    const result = await client.callTool({
      name: "get_records_by_visit",
      arguments: { api_id: 42, date: "2026-01-15" },
    });

    const parsed = JSON.parse((result.content as any)[0].text);
    expect(parsed).toHaveLength(2);
    expect(parsed[0].id).toBe(100);
    expect(parsed[1].id).toBe(102);
  });

  it("get_records_by_visit — нет записей → текстовое сообщение", async () => {
    setFetchResponse([]);

    const result = await client.callTool({
      name: "get_records_by_visit",
      arguments: { api_id: 999, date: "2026-01-15" },
    });

    const text = (result.content as any)[0].text;
    expect(text).toContain("api_id=999");
    expect(text).toContain("не найдены");
  });

  it("delete_record → DELETE на правильный путь", async () => {
    setFetchResponse({});

    await client.callTool({
      name: "delete_record",
      arguments: { record_id: 555 },
    });

    const lastCall = fetchMock.mock.calls[fetchMock.mock.calls.length - 1];
    const url = lastCall[0] as string;
    const method = (lastCall[1] as any).method;
    expect(url).toContain("/records/99999/555");
    expect(method).toBe("DELETE");
  });

  it("book_service строит правильный payload", async () => {
    setFetchResponse({ id: 777 });

    await client.callTool({
      name: "book_service",
      arguments: {
        visit_id: 42,
        service_id: 10,
        staff_id: 5,
        datetime: "2026-01-20 14:00:00",
        seance_length: 3600,
        client_name: "Анна",
        client_phone: "+66812345678",
      },
    });

    const lastCall = fetchMock.mock.calls[fetchMock.mock.calls.length - 1];
    const body = JSON.parse((lastCall[1] as any).body);
    expect(body.api_id).toBe(42);
    expect(body.save_if_busy).toBe(true);
    expect(body.services).toEqual([{ id: 10 }]);
    expect(body.client.name).toBe("Анна");
    expect(body.client.phone).toBe("+66812345678");
    expect(body.staff_id).toBe(5);
    expect(body.seance_length).toBe(3600);
  });

  it("update_record → PUT, record_id не в body", async () => {
    setFetchResponse({});

    await client.callTool({
      name: "update_record",
      arguments: { record_id: 123, attendance: 2, comment: "Пришёл" },
    });

    const lastCall = fetchMock.mock.calls[fetchMock.mock.calls.length - 1];
    const url = lastCall[0] as string;
    const method = (lastCall[1] as any).method;
    const body = JSON.parse((lastCall[1] as any).body);
    expect(url).toContain("/records/99999/123");
    expect(method).toBe("PUT");
    expect(body.attendance).toBe(2);
    expect(body.comment).toBe("Пришёл");
    expect(body.record_id).toBeUndefined();
  });

  it("create_client отправляет данные", async () => {
    setFetchResponse({ id: 999 });

    await client.callTool({
      name: "create_client",
      arguments: {
        name: "Тест",
        phone: "+66000000000",
        email: "test@test.com",
      },
    });

    const lastCall = fetchMock.mock.calls[fetchMock.mock.calls.length - 1];
    const body = JSON.parse((lastCall[1] as any).body);
    expect(body.name).toBe("Тест");
    expect(body.phone).toBe("+66000000000");
    expect(body.email).toBe("test@test.com");
  });

  it("get_available_times → URL с staff_id и date", async () => {
    setFetchResponse(["14:00", "15:00"]);

    await client.callTool({
      name: "get_available_times",
      arguments: { staff_id: 5, date: "2026-02-20" },
    });

    const url = fetchMock.mock.calls[fetchMock.mock.calls.length - 1][0] as string;
    expect(url).toContain("/book_times/99999/5/2026-02-20");
  });

  it("get_client → GET с client_id в пути", async () => {
    setFetchResponse({ id: 42, name: "Тест" });

    await client.callTool({
      name: "get_client",
      arguments: { client_id: 42 },
    });

    const url = fetchMock.mock.calls[fetchMock.mock.calls.length - 1][0] as string;
    expect(url).toContain("/client/99999/42");
  });

  it("update_client → PUT с client_id в пути", async () => {
    setFetchResponse({});

    await client.callTool({
      name: "update_client",
      arguments: { client_id: 42, name: "Новое имя" },
    });

    const lastCall = fetchMock.mock.calls[fetchMock.mock.calls.length - 1];
    const url = lastCall[0] as string;
    const method = (lastCall[1] as any).method;
    const body = JSON.parse((lastCall[1] as any).body);
    expect(url).toContain("/client/99999/42");
    expect(method).toBe("PUT");
    expect(body.name).toBe("Новое имя");
    expect(body.client_id).toBeUndefined();
  });

  it("get_staff_member → GET с staff_id в пути", async () => {
    setFetchResponse({ id: 7, name: "Мастер" });

    await client.callTool({
      name: "get_staff_member",
      arguments: { staff_id: 7 },
    });

    const url = fetchMock.mock.calls[fetchMock.mock.calls.length - 1][0] as string;
    expect(url).toContain("/staff/99999/7");
  });

  it("get_transactions → GET с датами", async () => {
    setFetchResponse([{ id: 1, amount: 1000 }]);

    await client.callTool({
      name: "get_transactions",
      arguments: { start_date: "2026-01-01", end_date: "2026-01-31" },
    });

    const url = fetchMock.mock.calls[fetchMock.mock.calls.length - 1][0] as string;
    expect(url).toContain("/transactions/99999");
    expect(url).toContain("start_date=2026-01-01");
    expect(url).toContain("end_date=2026-01-31");
  });

  it("get_available_dates → GET с параметрами", async () => {
    setFetchResponse(["2026-02-20", "2026-02-21"]);

    await client.callTool({
      name: "get_available_dates",
      arguments: { staff_id: 5, date_from: "2026-02-01", date_to: "2026-02-28" },
    });

    const url = fetchMock.mock.calls[fetchMock.mock.calls.length - 1][0] as string;
    expect(url).toContain("/book_dates/99999");
    expect(url).toContain("staff_id=5");
  });

  it("get_services → GET с фильтрами", async () => {
    setFetchResponse([{ id: 1, title: "Массаж" }]);

    await client.callTool({
      name: "get_services",
      arguments: { staff_id: 5, category_id: 3 },
    });

    const url = fetchMock.mock.calls[fetchMock.mock.calls.length - 1][0] as string;
    expect(url).toContain("/company/99999/services");
    expect(url).toContain("staff_id=5");
    expect(url).toContain("category_id=3");
  });

  it("get_records_by_client → GET с client_id", async () => {
    setFetchResponse([{ id: 1 }]);

    await client.callTool({
      name: "get_records_by_client",
      arguments: {
        client_id: 42,
        start_date: "2026-01-01",
        end_date: "2026-01-31",
      },
    });

    const url = fetchMock.mock.calls[fetchMock.mock.calls.length - 1][0] as string;
    expect(url).toContain("client_id=42");
    expect(url).toContain("start_date=2026-01-01");
  });
});

// --- Обработка ошибок ---

describe("обработка ошибок в инструментах", () => {
  it("API-ошибка → isError: true с сообщением", async () => {
    fetchMock = mock(() =>
      Promise.resolve(
        new Response("Unauthorized", {
          status: 401,
          headers: { "Content-Type": "text/plain" },
        })
      )
    );
    globalThis.fetch = fetchMock as any;

    const result = await client.callTool({
      name: "get_records",
      arguments: { start_date: "2026-01-01", end_date: "2026-01-31" },
    });

    expect(result.isError).toBe(true);
    const text = (result.content as any)[0].text;
    expect(text).toContain("401");
  });

  it("search_clients с пустым query → isError", async () => {
    const result = await client.callTool({
      name: "search_clients",
      arguments: { query: "   " },
    });

    expect(result.isError).toBe(true);
    const text = (result.content as any)[0].text;
    expect(text).toContain("пустым");
  });

  it("update_record без полей для обновления → isError", async () => {
    const result = await client.callTool({
      name: "update_record",
      arguments: { record_id: 123 },
    });

    expect(result.isError).toBe(true);
    const text = (result.content as any)[0].text;
    expect(text).toContain("хотя бы одно поле");
  });

  it("update_client без полей для обновления → isError", async () => {
    const result = await client.callTool({
      name: "update_client",
      arguments: { client_id: 42 },
    });

    expect(result.isError).toBe(true);
    const text = (result.content as any)[0].text;
    expect(text).toContain("хотя бы одно поле");
  });

  it("update_record с полями → работает", async () => {
    setFetchResponse({});

    const result = await client.callTool({
      name: "update_record",
      arguments: { record_id: 123, attendance: 2 },
    });

    expect(result.isError).toBeUndefined();
  });

  it("update_client с полями → работает", async () => {
    setFetchResponse({});

    const result = await client.callTool({
      name: "update_client",
      arguments: { client_id: 42, name: "Новое имя" },
    });

    expect(result.isError).toBeUndefined();
  });
});

// --- Пагинация get_records_by_visit ---

describe("пагинация get_records_by_visit", () => {
  it("загружает несколько страниц", async () => {
    let callCount = 0;
    fetchMock = mock(() => {
      callCount++;
      const records =
        callCount === 1
          ? Array.from({ length: 200 }, (_, i) => ({ id: i, api_id: i === 5 ? 42 : 0 }))
          : [{ id: 300, api_id: 42 }];
      return Promise.resolve(
        new Response(
          JSON.stringify({ success: true, data: records }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        )
      );
    });
    globalThis.fetch = fetchMock as any;

    const result = await client.callTool({
      name: "get_records_by_visit",
      arguments: { api_id: 42, date: "2026-01-15" },
    });

    const parsed = JSON.parse((result.content as any)[0].text);
    expect(parsed).toHaveLength(2);
    expect(fetchMock.mock.calls.length).toBe(2);
  });
});
