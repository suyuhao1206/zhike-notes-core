const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })

exports.main = async (event, context) => {
  const { prompt, negative_prompt = '', style = '' } = event

  if (!prompt) {
    return {
      success: false,
      code: 'INVALID_PARAMS',
      message: '请提供提示词'
    }
  }

  try {
    const res = await cloud.extend.AI.createModel('hunyuan-image').generateImage({
      data: {
        prompt: prompt,
        negative_prompt: negative_prompt,
        style: style
      }
    })

    if (res.data && res.data.length > 0) {
      const imageData = res.data[0]
      return {
        success: true,
        imageUrl: imageData.url,
        revised_prompt: imageData.revised_prompt || prompt
      }
    } else {
      return {
        success: false,
        code: 'NO_IMAGE',
        message: '未生成图片'
      }
    }
  } catch (err) {
    console.error('生图失败:', err)
    return {
      success: false,
      code: 'GENERATE_ERROR',
      message: err.message || '生图失败'
    }
  }
}
