# 💎 Traliran AI Hub (driftwm)

[![License: AGPL v3](https://img.shields.io/badge/License-AGPL_v3-blue.svg)](https://www.gnu.org/licenses/agpl-3.0)

A lightweight, serverless, and private web client for working with AI right in your browser. This version has been redesigned in the style of the Linux window manager driftwm, which features an infinite desktop concept. It works directly with Groq, Gemini, OpenAI, OpenRouter, DeepSeek, Qwen, GLM, Claude, and local backends (Ollama / Llama.cpp) without intermediaries.

---

## 🛠️ Need a custom bot or feature?

Need a personal AI assistant, a special integration, or a unique feature for **Traliran AI Hub driftwm**?

> 📩 **[Order a custom bot / feature](https://forms.gle/XpTQRCrpGdsbPiR48)**
> *Fill out a short form with your requirements and budget. We’ll respond within 48 hours. **Payment in cryptocurrency only.** :3*

---

## ✨ Web App & Assistant Store
👉 **[Launch Traliran AI Hub (driftwm) on GitHub Pages](https://traliran.github.io/traliran-ai-hub-driftwm/)**

### Assistant Store

Inside, you’ll find both built-in free tools (translator, code editor, idea generator) and exclusive **Premium bots** (advanced system prompts and configurations for screenwriters, prompt engineers, and content creators) for just **$4–$6**. Save hours on setting up prompts and get ready-made solutions for the price of a cup of coffee!

---

## 🛡️ 100% Privacy and Serverless
* **No intermediary servers:** The app runs 100% on the client side, right in your browser.
* ** Direct Routing:** Your API keys are stored exclusively in the browser’s `LocalStorage` and sent directly to the providers’ official endpoints. No logs, data collection, or leaks.
* **AGPLv3 Guarantee:** Complete freedom to audit, inspect the code, and self-host.

---

## 🚀 Key Features

* **Multi-provider support:** Quickly switch between cloud APIs (Groq, Google Gemini, OpenAI, OpenRouter, DeepSeek, Qwen, GLM, Claude) and local neural networks (Ollama, Llama.cpp).
* **☁️ Cloud Sync:** Synchronize chats, settings, and presets across all your devices.
* **🧠 Personal AI:** A section for entering context about yourself—automatically incorporated into all system prompts.
* **⚡ Multi-Model Setup:** Send a query to multiple models simultaneously and view their responses side by side for quick benchmarking.
* **👥 AI Group Debate Mode:** Test your ideas with three specialized agents (*Optimist*, *Critic*, *Technologist*) that analyze your hypothesis from different angles.
* **📝 Built-in Notes (My Notes):** A built-in notepad for quickly jotting down thoughts, drafts, and generated responses.
* **💻 Sandbox Interpreter:** Safe rendering and execution of generated HTML/JS/CSS code in a separate component right during the conversation.
* **🏪 Assistant Store:** A catalog of free extensions and ready-made presets for solving specific tasks (polyglot translator, code editor, idea generator, etc.).
* **🎨 Themes:** Support for multiple visual presets (Default Dark, Cyberpunk, Matrix).
* **⚙️ Fine-Tuning Parameters:** Control generation “on the fly” using the Temperature, Top P, and Max Tokens sliders.
* **📦 Import/Export:** Quickly save and load settings and profiles in JSON format.

---

## ⚙️ Quick Start and Connecting Providers

1. **Enter Key:** Select a provider in the sidebar (API Configuration) and paste your API key. The list of models will update automatically.
2. **Local Models:**
   * For **Ollama**, run the service with CORS requests enabled: `OLLAMA_ORIGINS=“*” ollama serve` (default endpoint: `http://localhost:11434/v1`).
   * For **Llama.cpp**, use the built-in web server (default endpoint: `http://localhost:8080/v1`).

---

## ⚖️ License and Terms of Use

This project is distributed under the **GNU Affero General Public License v3.0 (AGPLv3)**.

### What this means for forks and deployments:
1. **Open Source:** If you modify this software and run it on a server accessible to users over the network (SaaS, public websites), you **MUST** make the source code of your modifications available under the AGPLv3 license.
2. **Attribution:** You must preserve the original copyright notices, links to this repository, and provide a list of the changes you’ve made.
3. **Prohibition on Hidden Commercialization:** It is prohibited to close-source the code or hide built-in core features (including the store and author attribution) in public deployments.

*To obtain a commercial license or a white-label partnership without AGPLv3 restrictions, please contact the repository owner via email at cwcom@proton.me.*

Translated with DeepL.com (free version)
