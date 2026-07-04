# 消费者评论情感分析与购买建议智能体

这是一个可部署到 GitHub Pages 的静态 Web 智能体应用，题目为：

**基于 LLM 的消费者评论情感分析与购买建议**

## 功能

- 粘贴消费者评论 CSV 数据
- 本地规则工具完成情感初判、关注点统计、商品风险排序
- 调用阿里云百炼 Qwen 模型生成专业分析报告和购买建议
- 展示评论总数、负面率、主要问题、购买建议、情感分布、关注点分布和商品风险排序
- 支持下载 JSON 分析报告

## CSV 格式

推荐字段：

```csv
product,rating,comment
智能保温杯,5,保温效果很好，外观漂亮，包装也很用心
无线耳机,1,左耳用了两天就没声音，售后处理麻烦
```

也兼容中文字段：`商品,评分,评论`。

## GitHub Pages 部署步骤

1. 新建一个 GitHub 仓库，例如 `consumer-review-agent`。
2. 上传本目录中的所有文件：
   - `index.html`
   - `assets/styles.css`
   - `assets/app.js`
   - `sample_reviews.csv`
   - `.nojekyll`
   - `README.md`
3. 进入仓库 `Settings`。
4. 打开 `Pages`。
5. Source 选择 `Deploy from a branch`。
6. Branch 选择 `main`，目录选择 `/root`。
7. 保存后等待部署完成。
8. GitHub 会生成一个公网 URL，例如：

```text
https://你的用户名.github.io/consumer-review-agent/
```

## API Key 安全说明

GitHub Pages 是纯静态托管，不能安全保存服务器端密钥，也没有 Secrets 运行环境。

因此本项目采用更安全的课堂演示方式：

- API Key 由访问者在页面输入框中临时输入
- Key 只在当前浏览器页面中用于请求阿里云接口
- 不要把 API Key 写入 `index.html` 或 `app.js`
- 不要把 API Key 提交到 GitHub 仓库

如果必须让老师打开页面后无需输入 Key，就不能只用 GitHub Pages。需要增加一个后端代理，例如 Cloudflare Worker、Vercel Serverless Function、阿里云函数计算或普通服务器，并把 API Key 放在后端环境变量中。

## 模型设置

页面默认模型为 `qwen3.7-plus`，符合课程中对阿里云千问模型的要求。若接口返回模型不可用，请检查百炼控制台中当前账号和地域已开通的模型名称。
