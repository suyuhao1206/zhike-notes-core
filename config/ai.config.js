const defaultBots = {
  noteSummary: '7626369066156163126',
  qaAssistant: '7626370009735921664',
  examGenerator: '7626370288783130667',
  flashcardGen: '7626370444853608458',
  ocrVision: '7631191918264729663',
  audioTranscribe: ''
}

const baseConfig = {
  provider: 'cloud',
  providers: {
    cloud: {
      functionName: 'aiRouter',
      lightEngine: 'hunyuan',
      heavyEngine: 'coze'
    },
    hunyuan: {
      model: 'hunyuan-turbos-latest'
    },
    coze: {
      baseUrl: 'cloud://aiRouter',
      apiKey: '',
      bots: defaultBots
    },
    xfyun: {
      baseUrl: 'cloud://aiRouter',
      appId: '',
      apiKey: '',
      apiSecret: ''
    }
  }
}

function deepClone(obj) {
  return JSON.parse(JSON.stringify(obj))
}

function getAIConfigByEnv() {
  return deepClone(baseConfig)
}

module.exports = {
  getAIConfigByEnv,
  defaultBots
}
