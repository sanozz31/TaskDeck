import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import "./index.css";
import "./widget/widget.css";
import { Widget } from "./widget/Widget";

// 组件窗口独立的 QueryClient：轮询保鲜(refetchInterval 在各 hook 里设),不随焦点刷新。
const queryClient = new QueryClient({
  defaultOptions: { queries: { refetchOnWindowFocus: false, staleTime: 5_000 } },
});

// 刻意不用 StrictMode:组件靠副作用控制 OS 窗口位置/监听器,
// dev 下 StrictMode 双跑副作用会造成监听翻倍与移窗闪烁。
createRoot(document.getElementById("widget-root")!).render(
  <QueryClientProvider client={queryClient}>
    <Widget />
  </QueryClientProvider>,
);
