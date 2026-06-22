// 临时 e2e 截图脚本：复用本机 Chrome，截各视图。运行：node e2e-shot.mjs
import puppeteer from "puppeteer-core";

const CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const URL = "http://localhost:5173";
const OUT = "/tmp";

const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: "new",
  args: ["--no-sandbox", "--window-size=1180,760"],
  defaultViewport: { width: 1180, height: 760, deviceScaleFactor: 2 },
});
const page = await browser.newPage();
await page.goto(URL, { waitUntil: "networkidle2", timeout: 30000 });
await new Promise((r) => setTimeout(r, 1500)); // 等 health 门控 + 渲染

async function shot(name) {
  await page.screenshot({ path: `${OUT}/taskdeck-${name}.png` });
  console.log(`截图 ${name} ✓`);
}

await shot("1-chat");

// 切到「全部任务」
await page.evaluate(() => {
  const b = [...document.querySelectorAll(".nav-item")].find((e) =>
    e.textContent.includes("全部任务"),
  );
  b?.click();
});
await new Promise((r) => setTimeout(r, 800));
await shot("2-all");

// 切到「日历」
await page.evaluate(() => {
  const b = [...document.querySelectorAll(".nav-item")].find((e) =>
    e.textContent.includes("日历"),
  );
  b?.click();
});
await new Promise((r) => setTimeout(r, 800));
await shot("3-calendar");

// 切到「标签」
await page.evaluate(() => {
  const b = [...document.querySelectorAll(".nav-item")].find((e) =>
    e.textContent.includes("标签"),
  );
  b?.click();
});
await new Promise((r) => setTimeout(r, 800));
await shot("4-tags");

// 回对话，输入一个任务跑真实 AI 闭环
await page.evaluate(() => {
  const b = [...document.querySelectorAll(".nav-item")].find((e) =>
    e.textContent.includes("对话"),
  );
  b?.click();
});
await new Promise((r) => setTimeout(r, 500));
await page.type(".chat-input", "周日上午陪家人去公园散步");
await page.click(".chat-send");
console.log("已提交任务，等待 AI 分析…");
await page.waitForFunction(() => document.querySelector(".task-card") !== null, {
  timeout: 60000,
});
await new Promise((r) => setTimeout(r, 600));
await shot("5-chat-result");

await browser.close();
console.log("完成");
