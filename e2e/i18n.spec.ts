import { expect, test } from "@playwright/test";

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem("terminus-locale", "zh-CN"));
});

test("中文覆盖主工作区并可持久切换英文", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator("html")).toHaveAttribute("lang", "zh-CN");
  await expect(page.getByRole("heading", { name: "服务器" })).toBeVisible();
  await expect(page.getByRole("navigation", { name: "主导航" })).toBeVisible();
  await expect(page.getByRole("link", { name: "端口转发" })).toBeVisible();
  await expect(page.getByRole("textbox", { name: "查找主机或输入 SSH 命令" })).toBeVisible();

  await page.getByRole("button", { name: "偏好设置" }).click();
  await expect(page.getByRole("heading", { name: "偏好设置" })).toBeVisible();
  const language = page.getByRole("combobox", { name: "界面语言" });
  await expect(language).toHaveValue("zh-CN");
  await language.selectOption("en");
  await expect(page.getByRole("heading", { name: "Preferences" })).toBeVisible();
  await expect(page.locator("html")).toHaveAttribute("lang", "en");
  await expect(page.evaluate(() => localStorage.getItem("terminus-locale"))).resolves.toBe("en");
});

test("中文覆盖服务器建库和新建主机流程", async ({ page }) => {
  await page.goto("/?transport=deterministic-inventory");
  await expect(page.getByRole("heading", { name: "尚无保险库" })).toBeVisible();
  await page.getByRole("button", { name: "创建保险库" }).click();
  await page.getByRole("textbox", { name: "保险库名称" }).fill("中文测试库");
  await page.getByRole("button", { name: "保存保险库" }).click();
  await page.getByRole("button", { name: "新建服务器" }).first().click();
  await expect(page.getByRole("textbox", { name: "名称 *" })).toBeVisible();
  await expect(page.getByRole("textbox", { name: "地址 / 主机名 *" })).toBeVisible();
  await expect(page.getByRole("button", { name: "创建服务器" })).toBeVisible();
});

test("中文覆盖历史记录和端口转发页", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("link", { name: "端口转发" }).click();
  await expect(page.getByRole("heading", { name: "端口转发" })).toBeVisible();
  await expect(page.getByRole("button", { name: "新建规则" })).toBeVisible();
  await page.getByRole("link", { name: "历史记录" }).click();
  await expect(page.getByRole("heading", { name: "历史记录", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "导出" })).toBeDisabled();
});

test("中文覆盖 SFTP 连接与主机指纹提示", async ({ page }) => {
  await page.goto("/?transport=deterministic-sftp");
  await page.getByRole("link", { name: "SFTP" }).click();
  await expect(page.getByRole("heading", { name: "无 SFTP 连接" })).toBeVisible();
  await expect(page.getByText("请在上方选择主机和远程路径，或从下方选择最近连接。")).toBeVisible();
  await page.getByRole("combobox", { name: "主机" }).selectOption("h-web-prod-01");
  await page.getByRole("button", { name: "连接", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "验证 SFTP 主机密钥" });
  await expect(dialog).toContainText("连接前，请通过可信渠道核对该指纹。");
  await expect(dialog).toContainText("SHA256:synthetic");
});
