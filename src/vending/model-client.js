const OpenAI = require('openai');
require('dotenv').config();

const MODEL = process.env.VENDING_MODEL || 'deepseek-ai/DeepSeek-V4-Flash';
const MODEL_TIMEOUT_MS = 50_000;
const CALIBRATION_TIMEOUT_MS = 20_000;

function modelClient() {
  if (!process.env.SILICONFLOW_API_KEY) throw new Error('SILICONFLOW_API_KEY is not configured');
  return new OpenAI({
    apiKey: process.env.SILICONFLOW_API_KEY,
    baseURL: 'https://api.siliconflow.cn/v1',
    timeout: MODEL_TIMEOUT_MS,
    maxRetries: 0,
  });
}

module.exports = { MODEL, MODEL_TIMEOUT_MS, CALIBRATION_TIMEOUT_MS, modelClient };
