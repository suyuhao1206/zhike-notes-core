/**
 * 内部 AI 配置文件
 * - develop/trial 可放测试配置
 * - release 必须使用生产配置
 * 发布前只需要改这里
 */

const XIAOMI_BASE_URL = 'https://token-plan-sgp.xiaomimimo.com/v1';
const XIAOMI_CHAT_MODEL = 'mimo-v2.5-pro';
const XIAOMI_VISION_MODEL = 'mimo-v2.5';

const developConfig = {
  provider: 'xiaomi',
  providers: {
    xiaomi: {
      baseUrl: XIAOMI_BASE_URL,
      apiKey: '',
      model: XIAOMI_CHAT_MODEL,
      visionModel: XIAOMI_VISION_MODEL
    },
    coze: {
      baseUrl: 'https://api.coze.cn/v1',
      apiKey: '',
      bots: {
        noteSummary: '7626369066156163126',
        qaAssistant: '7626370009735921664',
        examGenerator: '7626370288783130667',
        flashcardGen: '7626370444853608458',
        ocrVision: '7631191918264729663',
        audioTranscribe: ''
      }
    },
    xfyun: {
      appId: '',
      apiKey: '',
      apiSecret: '',
      baseUrl: 'https://office-api-ist-dx.iflyaisol.com'
    },
    compatible: {
      baseUrl: '',
      apiKey: '',
      model: ''
    }
  }
};

const releaseConfig = {
  provider: 'xiaomi',
  providers: {
    xiaomi: {
      baseUrl: XIAOMI_BASE_URL,
      apiKey: '',
      model: XIAOMI_CHAT_MODEL,
      visionModel: XIAOMI_VISION_MODEL
    },
    coze: {
      baseUrl: 'https://api.coze.cn/v1',
      apiKey: '',
      bots: {
        noteSummary: '7626369066156163126',
        qaAssistant: '7626370009735921664',
        examGenerator: '7626370288783130667',
        flashcardGen: '7626370444853608458',
        ocrVision: '7631191918264729663',
        audioTranscribe: ''
      }
    },
    xfyun: {
      appId: '',
      apiKey: '',
      apiSecret: '',
      baseUrl: 'https://office-api-ist-dx.iflyaisol.com'
    },
    compatible: {
      baseUrl: '',
      apiKey: '',
      model: ''
    }
  }
};

function deepClone(obj) {
  return JSON.parse(JSON.stringify(obj));
}

function getAIConfigByEnv(envVersion) {
  if (envVersion === 'release') return deepClone(releaseConfig);
  return deepClone(developConfig);
}

module.exports = {
  getAIConfigByEnv
};
