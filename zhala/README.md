# Zhala: Chase's iPhone voice assistant

Zhala is a web app you add to your iPhone Home Screen. Tap the big mic, talk, and she talks back.
Her brain is Qwen and her voice is Qwen TTS, both from Alibaba Cloud Model Studio. Nothing to install
and no computer needed.

**Open it:** https://ccoop28.github.io/zhala/

## 1. Put Zhala on your Home Screen
1. Open **https://ccoop28.github.io/zhala/** in **Safari** on your iPhone. It has to be Safari, not the X or Instagram in-app browser.
2. Tap the **Share** button (the square with the arrow), then **Add to Home Screen**, then **Add**.
3. Open **Zhala** from your Home Screen like any other app.
4. The first time you tap the mic, iPhone asks to allow **Microphone** and **Speech Recognition**. Tap **Allow**.

## 2. Get your Alibaba key (only you can do this)
Without a key Zhala still does time, weather, notes and team status, using the iPhone's built-in voice.
The key switches on her Qwen brain and Qwen voice.

1. Sign up at **https://www.alibabacloud.com** with your own email and phone. Complete your account
   information when it asks; Alibaba requires this before Model Studio will activate.
2. Open the Model Studio API key page for the **Singapore** region:
   https://modelstudio.console.alibabacloud.com/ap-southeast-1/settings/api-key
   (if a region menu shows at the top right, pick **Singapore**). Activate Model Studio if asked.
3. Click **Create API Key**. Choose the default workspace and **All** permissions, then click **OK**.
4. **Copy the key straight away.** It starts with `sk-`, and Alibaba only shows it once.
5. Optional but recommended: turn on **Free Quota Only** in the console. Then the service just stops
   when the free quota runs out instead of billing your card.
6. In Zhala, tap the **gear** icon, paste the key into **API key**, and tap **Save**.

The key is stored **only on your iPhone** (Safari localStorage). Zhala sends it only to Alibaba
(`dashscope-intl.aliyuncs.com`). It is not in this website's code. Never paste it into a chat.
If your phone is lost, delete the key in the Alibaba console and make a new one.

Source: https://www.alibabacloud.com/help/en/model-studio/get-api-key

## 3. Talk to her
- **Tap the mic**, speak, and stop talking. She replies out loud. Tap again while she's talking to cut her off.
- You can also type in the box under the mic.
- **No "Hey Siri"-style wake word.** iPhone doesn't let web apps listen in the background, so it's always tap to talk.
- Try: "What's the time?", "What's the weather in Sydney?", "Add a note: call the accountant",
  "Read my notes", "How are we doing?" (live freelance team numbers).

If the mic doesn't work from the Home Screen icon (some iOS versions block speech recognition in
Home Screen apps), use the microphone key on the iPhone keyboard to dictate into the text box, or open Zhala in Safari.

## Settings
- **Brain:** default `qwen3.7-flash`, which is fast and cheap and has a free quota. The others are
  `qwen3.8-flash`, `qwen3.7-plus` (smarter), and the older `qwen-plus` and `qwen-flash`.
- **Voice engine:**
  - **Qwen3-TTS Flash** (default) uses Alibaba's preset voices. The default voice is **Jennifer**
    ("premium, cinematic-quality American English female"). Alibaba has **no New York accent
    preset**, and Jennifer is the only female voice it lists as American English.
  - **Qwen3-TTS Instruct Flash** sends an instruction asking for a confident New York City accent.
    The default voice for this engine is **Vivian** ("confident, cute, and slightly feisty"). How well
    the accent comes through varies, so tap **Test voice**.
  - **iPhone built-in voice** is free and works offline. It picks an en-US female voice such as Samantha.
- Zhala is an original character. She doesn't imitate any real actor or celebrity.

Female voices in the picker, all from Alibaba's list: Jennifer, Vivian, Katerina, Cherry, Serena, Maia,
Bella, Momo, Sonrisa, Elias, Bellona.
Source: https://docs.modelstudio.console.alibabacloud.com/en/model-studio/qwen-tts-voice-list

The earlier voice samples (A Brooklyn, B warm New York, C Long Island) are at `samples/voice-A.mp3`,
`voice-B.mp3` and `voice-C.mp3`. They were made with the open-source Qwen3-TTS VoiceDesign model on
our own computer, and they are **not** the cloud voices the app uses. They show what a designed New York voice can sound like.

## Free quota and pricing (Singapore / international, checked 6 Nov 2026)
- New Model Studio users in the **Singapore** region get a free quota per model. It is valid for
  **90 days** from activation, and each model has its own quota ("typically 1,000,000 tokens").
  After that you pay as you go, unless **Free Quota Only** is on.
  Source: https://www.alibabacloud.com/help/en/model-studio/new-free-quota
- Alibaba's pricing page lists these figures (international):
  - `qwen3.7-flash`: free quota **1 million tokens**. For requests of 32K tokens or less, input is
    **US$0.03** and output **US$0.13** per million tokens.
  - `qwen3.8-flash`: free quota **1 million tokens**. Input **US$0.15** and output **US$0.47** per million tokens.
  - `qwen3.7-plus`: free quota **1 million tokens**. Input list price **US$0.4** per million tokens
    (a limited-time 20% discount was shown).
  - `qwen-plus` and `qwen-flash`: **no free quota** listed.
  - `qwen3-tts-flash` (voice): **US$0.1 per 10,000 characters**. The free quota cell reads
    "110,000 characters"; check the exact figure in your console.
  - `qwen3-tts-instruct-flash` is on the free-quota model list, but we didn't find its price on the
    pricing page. Check the console before using it heavily.
  Source: https://www.alibabacloud.com/help/en/model-studio/model-pricing
- Rough scale: one short spoken reply is about 150 to 300 characters of voice and a few thousand
  tokens of brain, so normal personal use costs cents. Prices change, so the console is the source of truth.

## Team status
"How are we doing?" reads the team dashboard's public `data.json` on the same site, which is read-only.
Zhala reports job titles and amounts only, and hides emails and handles. If the dashboard can't be
reached, she says so and doesn't guess numbers.

## Technical notes
- Static site with no build step: `index.html`, `app.js`, `styles.css`, `manifest.json`, `sw.js`
  (offline app shell), and icons.
- Brain: `POST https://dashscope-intl.aliyuncs.com/compatible-mode/v1/chat/completions`
  (OpenAI-compatible), with function calling for the tools and `enable_thinking: false`.
- Voice: `POST https://dashscope-intl.aliyuncs.com/api/v1/services/aigc/multimodal-generation/generation`
  with `model: qwen3-tts-flash`. The response's `output.audio.url` is played; the URL is valid for 24 hours.
  Text is capped at 600 characters per request.
  Source: https://docs.modelstudio.console.alibabacloud.com/en/model-studio/qwen-tts-api
- **CORS:** Alibaba's intl endpoints return `Access-Control-Allow-Origin: https://ccoop28.github.io` for
  both the chat and TTS endpoints (see `qa/cors-check.txt`). The phone calls Alibaba directly, so
  **no proxy or Cloudflare account is needed**.
- Weather: Open-Meteo, which is free and needs no key. Notes stay in localStorage on the phone.
- QA: `qa/qa.js` renders iPhone-size (390×844) screenshots with mocked Alibaba and weather responses.
