/**
 * 内部 AI 配置文件
 * - develop/trial 可放测试配置
 * - release 必须使用生产配置
 * 发布前只需要改这里
 */

const developConfig = {
  provider: 'coze',
  providers: {
    coze: {
      baseUrl: 'https://api.coze.cn/v1',
      apiKey: '',
      bots: {
        noteSummary: '',
        qaAssistant: '',
        examGenerator: '',
        flashcardGen: ''
      }
    },
    openai: {
      baseUrl: 'https://api.openai.com/v1',
      apiKey: '',
      model: 'gpt-4o-mini'
    },
    compatible: {
      baseUrl: '',
      apiKey: '',
      model: ''
    }
  }
};

const releaseConfig = {
  provider: 'coze',
  providers: {
    coze: {
      baseUrl: 'https://api.coze.cn/v1',
      apiKey: '',
      bots: {
        noteSummary: '',
        qaAssistant: '',
        examGenerator: '',
        flashcardGen: ''
      }
    },
    openai: {
      baseUrl: 'https://api.openai.com/v1',
      apiKey: '',
      model: 'gpt-4o-mini'
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
