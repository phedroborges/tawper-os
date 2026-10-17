import { test, expect } from "@playwright/test";

test("chat real consulta apresentação, exibe fonte e continua a conversa", async ({ page }) => {
  test.setTimeout(240000);
  await page.goto("http://127.0.0.1:4100/meu-dia");
  await expect(page.getByText("Banco conectado —", { exact: true })).toBeVisible();
  await page.getByTitle("Pergunte à IA").click();
  const input = page.getByRole("textbox", { name: "Pergunta para a Tawper IA" });
  await input.fill("O que é o HydraSense? Responda em um parágrafo curto.");
  await page.getByRole("button", { name: "Enviar pergunta", exact: true }).click();
  await expect(page.getByText("Fontes consultadas", { exact: true })).toBeVisible({ timeout: 120000 });
  const firstSource = page.locator("details summary").first();
  await firstSource.click();
  await expect(page.getByRole("log")).toContainText("HydraSense");
  await input.fill("E quais dados ele registra em cada conjunto?");
  await page.getByRole("button", { name: "Enviar pergunta", exact: true }).click();
  await expect(page.getByText("Fontes consultadas", { exact: true })).toHaveCount(2, { timeout: 120000 });
  await expect(page.getByRole("log")).toContainText(/horímetro/i);
  await expect(page.locator("aside").getByRole("alert")).toHaveCount(0);
  await page.screenshot({ path: "../docs/evidencias/assistant-browser.png", fullPage: true });
  await page.getByRole("button", { name: "Nova conversa" }).click();
  await expect(page.getByText("Fontes consultadas", { exact: true })).toHaveCount(0);
  await expect(page.getByText("Como posso ajudar?", { exact: true })).toBeVisible();
});

test("erro de API preserva pergunta para nova tentativa", async ({ page }) => {
  await page.goto("http://127.0.0.1:4100/meu-dia");
  await expect(page.getByText("Banco conectado —", { exact: true })).toBeVisible();
  await page.route("**/api/assistant", (route) => route.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ error: "Conexão indisponível para este teste." }) }));
  await page.getByTitle("Pergunte à IA").click();
  const input = page.getByRole("textbox", { name: "Pergunta para a Tawper IA" });
  await input.fill("Quais são os diferenciais?");
  await page.getByRole("button", { name: "Enviar pergunta", exact: true }).click();
  await expect(page.locator("aside").getByRole("alert")).toContainText("Conexão indisponível");
  await expect(input).toHaveValue("Quais são os diferenciais?");
  await expect(page.getByRole("button", { name: "Enviar pergunta", exact: true })).toBeEnabled();
});

test("contexto da conta consulta visita do banco real por ID", async ({ page, request }) => {
  test.setTimeout(150000);
  const snapshotResponse = await request.get("http://127.0.0.1:4100/api/crm/snapshot");
  const { snapshot } = await snapshotResponse.json();
  const activity = snapshot?.activities.find((a: { tipo: string; status: string }) => a.tipo === "Visita" && a.status === "concluida");
  test.skip(!activity, "Nenhuma visita concluída no banco para esta verificação.");
  await page.goto(`http://127.0.0.1:4100/empresas/${activity.companyId}`);
  await expect(page.getByText("Banco conectado —", { exact: true })).toBeVisible();
  await page.getByTitle("Pergunte à IA").click();
  await page.getByRole("textbox", { name: "Pergunta para a Tawper IA" }).fill("Como foi a última visita a este cliente? Consulte a conta que está aberta.");
  const replyPromise = page.waitForResponse((r) => r.url().endsWith("/api/assistant") && r.request().method() === "POST", { timeout: 120000 });
  await page.getByRole("button", { name: "Enviar pergunta", exact: true }).click();
  const response = await replyPromise;
  expect(response.status()).toBe(200);
  const body = await response.json();
  expect(body.sources.some((s: { id: string }) => s.id === `crm:activities:${activity.id}`)).toBe(true);
  await expect(page.getByText("Fontes consultadas", { exact: true })).toBeVisible();
});
