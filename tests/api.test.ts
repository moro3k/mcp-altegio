import { describe, it, expect, beforeEach, afterEach, mock } from "bun:test";
import {
  altegioGet,
  altegioPost,
  altegioPut,
  altegioDelete,
  resolvePath,
  headers,
} from "../src/api";

// Мокаем глобальный fetch
const originalFetch = globalThis.fetch;
let fetchMock: ReturnType<typeof mock>;

function mockFetch(response: object, status = 200) {
  fetchMock = mock(() =>
    Promise.resolve(
      new Response(JSON.stringify(response), {
        status,
        headers: { "Content-Type": "application/json" },
      })
    )
  );
  globalThis.fetch = fetchMock as any;
}

function mockFetchError(body: string, status: number) {
  fetchMock = mock(() =>
    Promise.resolve(
      new Response(body, {
        status,
        headers: { "Content-Type": "text/plain" },
      })
    )
  );
  globalThis.fetch = fetchMock as any;
}

// Сохраняем оригинальные env
const origEnv = { ...process.env };

beforeEach(() => {
  // Устанавливаем тестовые env перед каждым тестом
  process.env.ALTEGIO_TOKEN = "test_partner_token";
  process.env.ALTEGIO_USER_TOKEN = "test_user_token";
  process.env.ALTEGIO_COMPANY_ID = "99999";
});

afterEach(() => {
  globalThis.fetch = originalFetch;
  // Восстанавливаем env
  process.env.ALTEGIO_TOKEN = origEnv.ALTEGIO_TOKEN;
  process.env.ALTEGIO_USER_TOKEN = origEnv.ALTEGIO_USER_TOKEN;
  process.env.ALTEGIO_COMPANY_ID = origEnv.ALTEGIO_COMPANY_ID;
});

// --- resolvePath ---

describe("resolvePath", () => {
  it("подставляет company_id", () => {
    expect(resolvePath("/records/{company_id}")).toBe("/records/99999");
  });

  it("путь без плейсхолдера остаётся без изменений", () => {
    expect(resolvePath("/some/path")).toBe("/some/path");
  });

  it("подставляет в середине пути", () => {
    expect(resolvePath("/client/{company_id}/123")).toBe("/client/99999/123");
  });

  it("подставляет первое вхождение", () => {
    expect(resolvePath("/a/{company_id}/b")).toBe("/a/99999/b");
  });
});

// --- headers ---

describe("headers", () => {
  it("Authorization содержит Bearer и User токены", () => {
    const h = headers();
    expect(h.Authorization).toBe(
      "Bearer test_partner_token, User test_user_token"
    );
  });

  it("Accept = application/vnd.api.v2+json", () => {
    const h = headers();
    expect(h.Accept).toBe("application/vnd.api.v2+json");
  });

  it("Content-Type = application/json", () => {
    const h = headers();
    expect(h["Content-Type"]).toBe("application/json");
  });

  it("бросает ошибку без ALTEGIO_TOKEN", () => {
    delete process.env.ALTEGIO_TOKEN;
    expect(() => headers()).toThrow("Missing env");
  });

  it("бросает ошибку без ALTEGIO_USER_TOKEN", () => {
    delete process.env.ALTEGIO_USER_TOKEN;
    expect(() => headers()).toThrow("Missing env");
  });

  it("бросает ошибку без ALTEGIO_COMPANY_ID", () => {
    delete process.env.ALTEGIO_COMPANY_ID;
    expect(() => headers()).toThrow("Missing env");
  });
});

// --- altegioGet ---

describe("altegioGet", () => {
  it("делает GET-запрос на правильный URL", async () => {
    mockFetch({ success: true, data: [{ id: 1 }] });
    await altegioGet("/records/{company_id}");
    const url = fetchMock.mock.calls[0][0] as string;
    expect(url).toContain("https://api.alteg.io/api/v1/records/99999");
    expect((fetchMock.mock.calls[0][1] as any).method).toBe("GET");
  });

  it("добавляет query-параметры", async () => {
    mockFetch({ success: true, data: [] });
    await altegioGet("/records/{company_id}", {
      start_date: "2026-01-01",
      end_date: "2026-01-31",
    });
    const url = fetchMock.mock.calls[0][0] as string;
    expect(url).toContain("start_date=2026-01-01");
    expect(url).toContain("end_date=2026-01-31");
  });

  it("пропускает undefined параметры", async () => {
    mockFetch({ success: true, data: [] });
    await altegioGet("/test", { a: "1", b: undefined });
    const url = fetchMock.mock.calls[0][0] as string;
    expect(url).toContain("a=1");
    expect(url).not.toContain("b=");
  });

  it("пропускает null параметры", async () => {
    mockFetch({ success: true, data: [] });
    await altegioGet("/test", { a: "1", b: null });
    const url = fetchMock.mock.calls[0][0] as string;
    expect(url).toContain("a=1");
    expect(url).not.toContain("b=");
  });

  it("без параметров — URL без query string", async () => {
    mockFetch({ success: true, data: [] });
    await altegioGet("/test");
    const url = fetchMock.mock.calls[0][0] as string;
    expect(url).toBe("https://api.alteg.io/api/v1/test");
  });

  it("распаковывает json.data", async () => {
    mockFetch({ success: true, data: [{ id: 1 }], meta: {} });
    const result = await altegioGet("/test");
    expect(result).toEqual([{ id: 1 }]);
  });

  it("возвращает весь json если нет data", async () => {
    mockFetch({ success: true, count: 5 });
    const result = await altegioGet("/test");
    expect(result).toEqual({ success: true, count: 5 });
  });

  it("числовые параметры конвертируются в строку", async () => {
    mockFetch({ success: true, data: [] });
    await altegioGet("/test", { page: 2, count: 50 });
    const url = fetchMock.mock.calls[0][0] as string;
    expect(url).toContain("page=2");
    expect(url).toContain("count=50");
  });
});

// --- altegioPost ---

describe("altegioPost", () => {
  it("делает POST-запрос", async () => {
    mockFetch({ success: true, data: { id: 42 } });
    await altegioPost("/records/{company_id}", { staff_id: 1 });
    expect((fetchMock.mock.calls[0][1] as any).method).toBe("POST");
  });

  it("отправляет body как JSON", async () => {
    mockFetch({ success: true, data: {} });
    const body = { staff_id: 1, services: [{ id: 10 }] };
    await altegioPost("/test", body);
    expect((fetchMock.mock.calls[0][1] as any).body).toBe(JSON.stringify(body));
  });

  it("распаковывает ответ", async () => {
    mockFetch({ success: true, data: { id: 42, status: "ok" } });
    const result = await altegioPost("/test", {});
    expect(result).toEqual({ id: 42, status: "ok" });
  });

  it("подставляет company_id в путь", async () => {
    mockFetch({ success: true, data: {} });
    await altegioPost("/records/{company_id}", {});
    const url = fetchMock.mock.calls[0][0] as string;
    expect(url).toContain("/records/99999");
  });
});

// --- altegioPut ---

describe("altegioPut", () => {
  it("делает PUT-запрос", async () => {
    mockFetch({ success: true, data: {} });
    await altegioPut("/records/{company_id}/123", { attendance: 1 });
    expect((fetchMock.mock.calls[0][1] as any).method).toBe("PUT");
  });

  it("отправляет body", async () => {
    mockFetch({ success: true, data: {} });
    const body = { attendance: 2, comment: "Пришёл" };
    await altegioPut("/test", body);
    expect((fetchMock.mock.calls[0][1] as any).body).toBe(JSON.stringify(body));
  });

  it("подставляет company_id в путь", async () => {
    mockFetch({ success: true, data: {} });
    await altegioPut("/records/{company_id}/456", {});
    const url = fetchMock.mock.calls[0][0] as string;
    expect(url).toContain("/records/99999/456");
  });
});

// --- altegioDelete ---

describe("altegioDelete", () => {
  it("делает DELETE-запрос", async () => {
    mockFetch({ success: true, data: {} });
    await altegioDelete("/records/{company_id}/789");
    expect((fetchMock.mock.calls[0][1] as any).method).toBe("DELETE");
  });

  it("не отправляет body", async () => {
    mockFetch({ success: true, data: {} });
    await altegioDelete("/test");
    expect((fetchMock.mock.calls[0][1] as any).body).toBeUndefined();
  });

  it("подставляет company_id в путь", async () => {
    mockFetch({ success: true, data: {} });
    await altegioDelete("/records/{company_id}/100");
    const url = fetchMock.mock.calls[0][0] as string;
    expect(url).toContain("/records/99999/100");
  });
});

// --- Обработка ошибок ---

describe("обработка ошибок API", () => {
  it("бросает ошибку при статусе 400", async () => {
    mockFetchError("Bad Request", 400);
    await expect(altegioGet("/test")).rejects.toThrow("400");
  });

  it("бросает ошибку при статусе 401", async () => {
    mockFetchError("Unauthorized", 401);
    await expect(altegioGet("/test")).rejects.toThrow("401");
  });

  it("бросает ошибку при статусе 404", async () => {
    mockFetchError("Not Found", 404);
    await expect(altegioGet("/test")).rejects.toThrow("404");
  });

  it("бросает ошибку при статусе 500", async () => {
    mockFetchError("Internal Server Error", 500);
    await expect(altegioGet("/test")).rejects.toThrow("500");
  });

  it("сообщение ошибки содержит метод и путь", async () => {
    mockFetchError("Not Found", 404);
    await expect(altegioGet("/records/{company_id}")).rejects.toThrow(
      "Altegio API GET /records/99999"
    );
  });

  it("сообщение ошибки содержит тело ответа", async () => {
    mockFetchError("Custom error message", 422);
    await expect(altegioPost("/test", {})).rejects.toThrow(
      "Custom error message"
    );
  });
});

// --- Обработка ответов ---

describe("обработка ответов", () => {
  it("data=null → возвращает null", async () => {
    mockFetch({ success: true, data: null });
    const result = await altegioGet("/test");
    expect(result).toBeNull();
  });

  it("data=[] → возвращает пустой массив", async () => {
    mockFetch({ success: true, data: [] });
    const result = await altegioGet("/test");
    expect(result).toEqual([]);
  });

  it("data=0 → возвращает 0", async () => {
    mockFetch({ success: true, data: 0 });
    const result = await altegioGet("/test");
    expect(result).toBe(0);
  });
});
