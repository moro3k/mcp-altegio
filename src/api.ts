// HTTP-клиент для Altegio API
// Все запросы идут через единый обработчик с авторизацией

const BASE_URL = "https://api.alteg.io/api/v1";

// Переменные окружения для авторизации
const token = process.env.ALTEGIO_TOKEN;
const userToken = process.env.ALTEGIO_USER_TOKEN;
const companyId = process.env.ALTEGIO_COMPANY_ID;

if (!token || !userToken || !companyId) {
  throw new Error(
    "Missing env: ALTEGIO_TOKEN, ALTEGIO_USER_TOKEN, ALTEGIO_COMPANY_ID"
  );
}

// Заголовки авторизации: Bearer (партнёрский) + User (пользовательский) токены
function headers(): Record<string, string> {
  return {
    Authorization: `Bearer ${token}, User ${userToken}`,
    Accept: "application/vnd.api.v2+json",
    "Content-Type": "application/json",
  };
}

// Подстановка company_id в шаблон пути
function resolvePath(path: string): string {
  return path.replace("{company_id}", companyId!);
}

// Универсальный обработчик запросов
// Altegio оборачивает ответы в { success, data, meta } — возвращаем только data
async function request(
  method: string,
  path: string,
  params?: Record<string, unknown>,
  body?: unknown
) {
  const resolved = resolvePath(path);
  const url = new URL(`${BASE_URL}${resolved}`);

  if (params) {
    for (const [key, value] of Object.entries(params)) {
      if (value !== undefined && value !== null) {
        url.searchParams.set(key, String(value));
      }
    }
  }

  const res = await fetch(url.toString(), {
    method,
    headers: headers(),
    body: body ? JSON.stringify(body) : undefined,
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Altegio API ${method} ${resolved}: ${res.status} ${text}`);
  }

  const json = await res.json();
  return json.data !== undefined ? json.data : json;
}

export function altegioGet(path: string, params?: Record<string, unknown>) {
  return request("GET", path, params);
}

export function altegioPost(path: string, body: unknown) {
  return request("POST", path, undefined, body);
}

export function altegioPut(path: string, body: unknown) {
  return request("PUT", path, undefined, body);
}

export function altegioDelete(path: string) {
  return request("DELETE", path);
}

export { companyId };
