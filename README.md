# MCP-сервер для Altegio API

MCP-сервер для AI-ассистентов (Claude, Cursor и др.) — прямой доступ к [Altegio API](https://api.alteg.io/): записи, клиенты, услуги, сотрудники, расписание.

## Стек

- **Runtime**: [Bun](https://bun.sh/)
- **SDK**: `@modelcontextprotocol/sdk` 1.26 (`registerTool`, `zod/v4`)
- **Transport**: stdio

## Возможности

18 инструментов:

| Группа | Инструменты | Описание |
|--------|-------------|----------|
| Записи | `get_records`, `create_record`, `update_record`, `delete_record` | CRUD с `api_id`, `save_if_busy`, `attendance` |
| Клиенты | `search_clients`, `get_client`, `create_client`, `update_client` | Поиск по имени/телефону/email |
| Услуги | `get_services`, `get_service_categories` | Каталог с фильтрацией по мастеру |
| Сотрудники | `get_staff`, `get_staff_member` | Фильтр активных (без уволенных) |
| Расписание | `get_available_times`, `get_available_dates` | Свободные слоты и рабочие дни |
| Финансы | `get_transactions` | Транзакции за период |
| Интеграция | `book_service`, `get_records_by_visit`, `get_records_by_client` | Бронирование с привязкой к визиту |

## Установка

```bash
git clone https://github.com/moro3k/mcp-altegio.git
cd mcp-altegio
bun install
```

## Настройка

```bash
cp .env.example .env
```

Заполните `.env`:

```
ALTEGIO_TOKEN=<партнёрский токен>
ALTEGIO_USER_TOKEN=<пользовательский токен>
ALTEGIO_COMPANY_ID=<ID компании>
```

**Где взять:**
- `ALTEGIO_TOKEN` — партнёрский токен из кабинета разработчика Altegio
- `ALTEGIO_USER_TOKEN` — пользовательский токен (через авторизацию API)
- `ALTEGIO_COMPANY_ID` — ID компании (виден в URL панели управления)

## Запуск

```bash
bun run src/index.ts
```

Сервер использует транспорт **stdio** — общается через stdin/stdout, порт не слушает.

## Подключение к Claude Code

Добавьте в `.mcp.json` в корне вашего проекта:

```json
{
  "mcpServers": {
    "altegio": {
      "command": "bun",
      "args": ["run", "/путь/к/mcp-altegio/src/index.ts"],
      "cwd": "/путь/к/mcp-altegio"
    }
  }
}
```

Bun автоматически загружает `.env` из `cwd`.

Можно передать переменные напрямую:

```json
{
  "mcpServers": {
    "altegio": {
      "command": "bun",
      "args": ["run", "/путь/к/mcp-altegio/src/index.ts"],
      "env": {
        "ALTEGIO_TOKEN": "...",
        "ALTEGIO_USER_TOKEN": "...",
        "ALTEGIO_COMPANY_ID": "..."
      }
    }
  }
}
```

## Подключение к Cursor

Settings → MCP Servers → Add:

```json
{
  "altegio": {
    "command": "bun",
    "args": ["run", "/путь/к/mcp-altegio/src/index.ts"],
    "cwd": "/путь/к/mcp-altegio"
  }
}
```

## Нюансы Altegio API

| Параметр | Описание |
|----------|----------|
| `api_id` | Только целое число. Строки игнорируются, записываются как `0` |
| `save_if_busy` | Ставьте `true` при программном создании, иначе ошибка конфликта |
| `seance_length` | Длительность в **секундах** (3600 = 1 час) |
| `attendance` | `-1` отменён, `0` ожидается, `1` подтверждён, `2` пришёл |
| `fired` | `0` активный сотрудник, `1` уволенный |

## Структура

```
src/
├── api.ts      # HTTP-клиент (авторизация, подстановка company_id)
└── index.ts    # MCP-сервер, регистрация инструментов
```

## Лицензия

MIT
