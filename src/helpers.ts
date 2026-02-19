// Вспомогательные функции — чистая логика без зависимостей от API

/**
 * Определяет тип поискового запроса: телефон, email или имя.
 * Используется в search_clients для автоматического выбора параметра.
 */
export function detectSearchType(query: string): {
  field: "phone" | "email" | "fullname";
  value: string;
} {
  const trimmed = query.trim();
  const isPhone = /^\+?\d[\d\s\-()]{5,}$/.test(trimmed);
  const isEmail = trimmed.includes("@");

  if (isPhone) return { field: "phone", value: trimmed };
  if (isEmail) return { field: "email", value: trimmed };
  return { field: "fullname", value: trimmed };
}

/**
 * Фильтрует уволенных сотрудников.
 * fired=1 или fired=true — уволен.
 */
export function filterActiveStaff<T extends Record<string, unknown>>(
  staff: T[]
): T[] {
  return staff.filter((s) => s.fired !== 1 && s.fired !== true);
}

/**
 * Фильтрует записи по api_id.
 * Сравнение через String() потому что API может вернуть число или строку.
 */
export function filterByApiId<T extends Record<string, unknown>>(
  records: T[],
  apiId: number
): T[] {
  return records.filter((r) => String(r.api_id) === String(apiId));
}

/**
 * Формирует стандартный ответ MCP-инструмента.
 */
export function formatToolResponse(data: unknown) {
  return {
    content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }],
  };
}

/**
 * Формирует текстовый ответ MCP-инструмента.
 */
export function formatTextResponse(text: string) {
  return {
    content: [{ type: "text" as const, text }],
  };
}

/**
 * Формирует ответ с ошибкой MCP-инструмента.
 */
export function formatErrorResponse(error: unknown) {
  const message =
    error instanceof Error ? error.message : String(error);
  return {
    content: [{ type: "text" as const, text: message }],
    isError: true,
  };
}
