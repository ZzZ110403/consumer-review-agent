const sampleCsv = `product,rating,comment
智能保温杯,5,保温效果很好，外观漂亮，包装也很用心
智能保温杯,2,杯盖有点漏水，客服回复很慢
智能保温杯,4,价格略贵，但是温度显示很方便
无线耳机,5,音质不错，连接稳定，物流很快
无线耳机,1,左耳用了两天就没声音，售后处理麻烦
无线耳机,3,佩戴舒服，但是降噪效果一般
空气炸锅,4,操作方便，做薯条很好吃
空气炸锅,2,噪音比较大，第一次使用有异味
空气炸锅,5,容量够大，清洗也方便，推荐
扫地机器人,3,路线规划一般，有时候会卡在桌脚
扫地机器人,2,拖地效果不稳定，售后让我反复重置
扫地机器人,5,解放双手，清洁效果比预期好
护眼台灯,5,亮度调节细腻，孩子写作业很舒服
护眼台灯,2,底座有划痕，包装保护不够
护眼台灯,4,价格合适，光线柔和，发货很快`;

const positiveWords = ["好", "满意", "喜欢", "推荐", "方便", "清晰", "稳定", "漂亮", "耐用", "划算", "优秀", "不错", "快", "舒服", "柔和"];
const negativeWords = ["差", "慢", "贵", "坏", "退货", "失望", "卡", "漏", "破", "异味", "噪音", "发热", "不准", "难用", "麻烦", "划痕"];

const aspectMap = {
  产品质量: ["质量", "做工", "材质", "耐用", "坏", "破", "漏", "瑕疵", "划痕"],
  价格价值: ["价格", "贵", "便宜", "划算", "性价比", "优惠"],
  物流包装: ["物流", "快递", "配送", "发货", "包装", "到货"],
  售后服务: ["客服", "售后", "退货", "换货", "服务", "回复"],
  功能体验: ["功能", "操作", "方便", "难用", "稳定", "卡", "体验", "降噪", "清洁", "亮度"],
};

const state = {
  latestReport: null,
};

const els = {
  apiKey: document.querySelector("#apiKey"),
  modelName: document.querySelector("#modelName"),
  baseUrl: document.querySelector("#baseUrl"),
  csvInput: document.querySelector("#csvInput"),
  loadSample: document.querySelector("#loadSample"),
  analyzeButton: document.querySelector("#analyzeButton"),
  downloadReport: document.querySelector("#downloadReport"),
  statusText: document.querySelector("#statusText"),
  agentMode: document.querySelector("#agentMode"),
  totalCount: document.querySelector("#totalCount"),
  negativeRate: document.querySelector("#negativeRate"),
  mainAspect: document.querySelector("#mainAspect"),
  buySignal: document.querySelector("#buySignal"),
  summaryText: document.querySelector("#summaryText"),
  insightList: document.querySelector("#insightList"),
  adviceList: document.querySelector("#adviceList"),
  sentimentBars: document.querySelector("#sentimentBars"),
  aspectBars: document.querySelector("#aspectBars"),
  productRows: document.querySelector("#productRows"),
};

els.csvInput.value = sampleCsv;

els.loadSample.addEventListener("click", () => {
  els.csvInput.value = sampleCsv;
  setStatus("已载入样例评论数据");
});

els.downloadReport.addEventListener("click", () => {
  if (!state.latestReport) {
    setStatus("请先完成一次分析");
    return;
  }
  const blob = new Blob([JSON.stringify(state.latestReport, null, 2)], {
    type: "application/json;charset=utf-8",
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = "consumer-review-agent-report.json";
  link.click();
  URL.revokeObjectURL(url);
});

els.analyzeButton.addEventListener("click", async () => {
  els.analyzeButton.disabled = true;
  setStatus("正在解析评论数据...");

  try {
    const reviews = parseCsv(els.csvInput.value);
    if (!reviews.length) {
      throw new Error("没有识别到评论，请检查 CSV 是否包含 comment 或 评论 字段");
    }

    const localResult = analyzeLocally(reviews);
    render(localResult);

    const apiKey = els.apiKey.value.trim();
    if (!apiKey) {
      localResult.mode = "本地规则分析";
      localResult.notice = "未输入阿里云 API Key，当前展示本地规则兜底结果。";
      state.latestReport = localResult;
      render(localResult);
      setStatus("已完成本地规则分析。输入 API Key 后可调用 Qwen 生成专业报告。");
      return;
    }

    setStatus("正在调用阿里云百炼 Qwen 模型...");
    const qwenResult = await callQwen(localResult, reviews, apiKey);
    state.latestReport = qwenResult;
    render(qwenResult);
    setStatus("分析完成，已生成智能体报告");
  } catch (error) {
    setStatus(error.message);
  } finally {
    els.analyzeButton.disabled = false;
  }
});

function parseCsv(text) {
  const lines = text.trim().split(/\r?\n/).filter(Boolean);
  if (lines.length < 2) return [];

  const headers = splitCsvLine(lines[0]).map((h) => h.trim());
  return lines.slice(1).map((line, index) => {
    const cells = splitCsvLine(line);
    const row = Object.fromEntries(headers.map((h, i) => [h, cells[i] || ""]));
    const comment = row.comment || row.content || row["评论"] || row["内容"] || "";
    const product = row.product || row["商品"] || row["产品"] || "未命名商品";
    const ratingValue = row.rating || row["评分"] || "";
    const rating = Number.parseFloat(ratingValue);
    return {
      id: index + 1,
      product: product.trim(),
      rating: Number.isFinite(rating) ? rating : null,
      comment: comment.trim(),
    };
  }).filter((row) => row.comment);
}

function splitCsvLine(line) {
  const result = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i += 1) {
    const char = line[i];
    const next = line[i + 1];

    if (char === '"' && next === '"') {
      current += '"';
      i += 1;
    } else if (char === '"') {
      inQuotes = !inQuotes;
    } else if (char === "," && !inQuotes) {
      result.push(current);
      current = "";
    } else {
      current += char;
    }
  }

  result.push(current);
  return result.map((value) => value.trim());
}

function analyzeLocally(reviews) {
  const sentiments = {};
  const aspects = {};
  const products = {};
  const enriched = reviews.map((review) => {
    const sentiment = classifySentiment(review);
    const foundAspects = extractAspects(review.comment);
    increase(sentiments, sentiment, 1);
    foundAspects.forEach((aspect) => increase(aspects, aspect, 1));

    if (!products[review.product]) {
      products[review.product] = { product: review.product, count: 0, ratings: [], negative: 0 };
    }
    products[review.product].count += 1;
    if (review.rating !== null) products[review.product].ratings.push(review.rating);
    if (sentiment === "负面") products[review.product].negative += 1;

    return { ...review, sentiment, aspects: foundAspects };
  });

  const productList = Object.values(products).map((item) => {
    const avg = item.ratings.length ? item.ratings.reduce((a, b) => a + b, 0) / item.ratings.length : null;
    return {
      product: item.product,
      count: item.count,
      avg_rating: avg === null ? null : Number(avg.toFixed(2)),
      negative_rate: Number((item.negative / item.count).toFixed(2)),
    };
  }).sort((a, b) => b.negative_rate - a.negative_rate || (a.avg_rating || 0) - (b.avg_rating || 0));

  const topAspect = Object.entries(aspects).sort((a, b) => b[1] - a[1])[0]?.[0] || "整体体验";
  const negativeCount = sentiments["负面"] || 0;
  const negativeRate = negativeCount / reviews.length;

  return {
    mode: "本地规则分析",
    total: reviews.length,
    sentiments,
    aspects,
    products: productList,
    reviews: enriched,
    summary: `共分析 ${reviews.length} 条评论，当前负面率为 ${Math.round(negativeRate * 100)}%，主要关注点集中在「${topAspect}」。`,
    insights: [
      `用户反馈最集中的维度是「${topAspect}」。`,
      productList[0] ? `风险最高的商品是「${productList[0].product}」，负面率约为 ${Math.round(productList[0].negative_rate * 100)}%。` : "暂无商品风险数据。",
      "本地工具已完成情感分布、关注点提取和商品风险排序。",
    ],
    advice: [
      negativeRate > 0.4 ? "建议谨慎购买，优先查看低分评论中的共性问题。" : "总体反馈可接受，可结合个人需求继续比较。",
      "重点关注质量、售后和功能体验类问题，因为这些问题通常最影响长期使用。",
      "如果同一商品低分评论集中在同一问题上，建议等待新版或选择替代商品。",
    ],
  };
}

function classifySentiment(review) {
  if (review.rating !== null) {
    if (review.rating >= 4) return "正面";
    if (review.rating <= 2) return "负面";
  }
  const pos = positiveWords.filter((word) => review.comment.includes(word)).length;
  const neg = negativeWords.filter((word) => review.comment.includes(word)).length;
  if (pos > neg) return "正面";
  if (neg > pos) return "负面";
  return "中性";
}

function extractAspects(comment) {
  const result = Object.entries(aspectMap)
    .filter(([, words]) => words.some((word) => comment.includes(word)))
    .map(([aspect]) => aspect);
  return result.length ? result : ["整体体验"];
}

function increase(obj, key, value) {
  obj[key] = (obj[key] || 0) + value;
}

async function callQwen(localResult, reviews, apiKey) {
  const baseUrl = els.baseUrl.value.trim().replace(/\/$/, "");
  const model = els.modelName.value.trim() || "qwen3.7-plus";

  const compactReviews = reviews.slice(0, 80).map((review) => ({
    product: review.product,
    rating: review.rating,
    comment: review.comment.slice(0, 220),
  }));

  const payload = {
    model,
    messages: [
      {
        role: "system",
        content: "你是一个专业的消费者评论情感分析与购买建议智能体。请根据评论数据和统计结果，输出严格 JSON，不要 Markdown。",
      },
      {
        role: "user",
        content: JSON.stringify({
          task: "分析消费者评论，输出情感结论、商品风险、购买建议和商家改进建议。",
          required_json_schema: {
            summary: "string",
            insights: ["string"],
            advice: ["string"],
            buy_signal: "推荐购买/谨慎购买/不建议购买",
          },
          local_statistics: {
            total: localResult.total,
            sentiments: localResult.sentiments,
            aspects: localResult.aspects,
            products: localResult.products,
          },
          reviews: compactReviews,
        }, null, 2),
      },
    ],
    temperature: 0.2,
    response_format: { type: "json_object" },
    enable_thinking: false,
  };

  let response;
  try {
    response = await fetch(`${baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });
  } catch (error) {
    throw new Error("浏览器未能连接阿里云接口，可能是网络或跨域限制。GitHub Pages 无后端能力，若需隐藏 Key 并稳定调用模型，请增加后端代理。");
  }

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data.error?.message || `Qwen 接口调用失败：HTTP ${response.status}`);
  }

  const content = data.choices?.[0]?.message?.content;
  if (!content) {
    throw new Error("Qwen 返回结果为空");
  }

  const qwenJson = JSON.parse(content);
  return {
    ...localResult,
    mode: `阿里云 ${model}`,
    summary: qwenJson.summary || localResult.summary,
    insights: Array.isArray(qwenJson.insights) ? qwenJson.insights : localResult.insights,
    advice: Array.isArray(qwenJson.advice) ? qwenJson.advice : localResult.advice,
    buy_signal: qwenJson.buy_signal || localResult.buy_signal,
  };
}

function render(result) {
  const negativeCount = result.sentiments["负面"] || 0;
  const negativeRate = result.total ? Math.round((negativeCount / result.total) * 100) : 0;
  const topAspect = Object.entries(result.aspects || {}).sort((a, b) => b[1] - a[1])[0]?.[0] || "-";
  const buySignal = result.buy_signal || (negativeRate > 40 ? "谨慎购买" : "可以考虑");

  els.agentMode.textContent = result.mode || "已分析";
  els.totalCount.textContent = result.total || 0;
  els.negativeRate.textContent = `${negativeRate}%`;
  els.mainAspect.textContent = topAspect;
  els.buySignal.textContent = buySignal;
  els.summaryText.textContent = result.summary || "";

  renderList(els.insightList, result.insights || []);
  renderList(els.adviceList, result.advice || []);
  renderBars(els.sentimentBars, result.sentiments || {}, "sentiment");
  renderBars(els.aspectBars, result.aspects || {}, "aspect");
  renderProducts(result.products || []);
}

function renderList(container, items) {
  container.innerHTML = "";
  items.forEach((item) => {
    const li = document.createElement("li");
    li.textContent = item;
    container.appendChild(li);
  });
}

function renderBars(container, data, type) {
  const entries = Object.entries(data);
  const max = Math.max(...entries.map(([, value]) => value), 1);
  container.innerHTML = "";

  entries.forEach(([label, value]) => {
    const row = document.createElement("div");
    row.className = "bar-row";
    const cls = type === "aspect" ? "aspect" : label === "负面" ? "negative" : label === "中性" ? "neutral" : "";
    row.innerHTML = `
      <span>${label}</span>
      <div class="bar-track"><div class="bar-fill ${cls}" style="width:${(value / max) * 100}%"></div></div>
      <strong>${value}</strong>
    `;
    container.appendChild(row);
  });
}

function renderProducts(products) {
  els.productRows.innerHTML = "";
  products.forEach((item) => {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${escapeHtml(item.product)}</td>
      <td>${item.count}</td>
      <td>${item.avg_rating ?? "-"}</td>
      <td>${Math.round((item.negative_rate || 0) * 100)}%</td>
    `;
    els.productRows.appendChild(tr);
  });
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function setStatus(text) {
  els.statusText.textContent = text;
}

render(analyzeLocally(parseCsv(sampleCsv)));
