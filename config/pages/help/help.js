Page({
  data: {
    expanded: ''
  },

  onLoad() {
    // 页面加载
  },

  // 展开/收起帮助项
  expandItem(e) {
    const id = e.currentTarget.dataset.id;
    this.setData({
      expanded: this.data.expanded === id ? '' : id
    });
  },

  // 提交反馈
  sendFeedback() {
    wx.showModal({
      title: '提交反馈',
      content: '感谢您的反馈！我们会认真处理每一条建议。',
      editable: true,
      placeholderText: '请输入您的建议或问题...',
      success: (res) => {
        if (res.confirm && res.content) {
          // 保存反馈到本地（实际应用应发送到服务器）
          const feedbacks = wx.getStorageSync('feedbacks') || [];
          feedbacks.push({
            id: Date.now(),
            content: res.content,
            createTime: new Date().toISOString()
          });
          wx.setStorageSync('feedbacks', feedbacks);

          wx.showToast({
            title: '反馈已提交',
            icon: 'success'
          });
        }
      }
    });
  },

  // 分享
  onShareAppMessage() {
    return {
      title: '智课笔记 - 帮助中心',
      path: '/pages/help/help'
    };
  }
});
