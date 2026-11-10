const OpenAI = require('openai');
require('dotenv').config();

const MODEL = process.env.VENDING_MODEL || 'deepseek-ai/DeepSeek-V4-Flash';

function modelClient() {
  if (!process.env.SILICONFLOW_API_KEY) throw new Error('SILICONFLOW_API_KEY is not configured');
  return new OpenAI({
    apiKey: process.env.SILICONFLOW_API_KEY,
    baseURL: 'https://api.siliconflow.cn/v1',
    timeout: 30000,
  });
}

module.exports = { MODEL, modelClient };
