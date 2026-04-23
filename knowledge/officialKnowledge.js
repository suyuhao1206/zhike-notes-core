const officialKnowledge = {
  '高等数学': [
    {
      id: 'math_001',
      title: '极限的概念与计算',
      content: '极限是微积分的基础概念。定义：当自变量x无限接近某一点x₀时，函数f(x)无限接近某个常数L，则称L为f(x)在x₀处的极限，记作lim(x→x₀) f(x) = L。重要极限：lim(x→0) sin(x)/x = 1，lim(x→∞) (1+1/x)^x = e。计算方法：直接代入法、因式分解、有理化、等价无穷小替换等。',
      tags: ['极限', '微积分', '基础'],
      importance: 5
    },
    {
      id: 'math_002',
      title: '导数的定义与应用',
      content: '导数表示函数在某点的瞬时变化率。定义：f\'(x) = lim(h→0) [f(x+h)-f(x)]/h。常用求导公式：(x^n)\' = nx^(n-1)，(e^x)\' = e^x，(ln x)\' = 1/x，(sin x)\' = cos x，(cos x)\' = -sin x。应用：求切线、判断单调性、求极值、最值问题。',
      tags: ['导数', '应用', '重点'],
      importance: 5
    },
    {
      id: 'math_003',
      title: '不定积分基本方法',
      content: '不定积分是导数的逆运算。基本积分公式：∫x^n dx = x^(n+1)/(n+1)+C，∫e^x dx = e^x+C，∫1/x dx = ln|x|+C。积分方法：1. 直接积分法 2. 换元积分法（第一类、第二类）3. 分部积分法：∫u dv = uv - ∫v du。常见技巧：三角换元、倒代换等。',
      tags: ['积分', '方法', '技巧'],
      importance: 4
    },
    {
      id: 'math_004',
      title: '定积分的应用',
      content: '定积分的应用包括：1. 计算平面图形的面积 2. 计算旋转体的体积 3. 计算曲线的弧长 4. 物理应用：变力做功、液体压力等。牛顿-莱布尼茨公式：∫[a,b] f(x)dx = F(b) - F(a)，其中F(x)是f(x)的一个原函数。',
      tags: ['定积分', '应用', '几何'],
      importance: 4
    }
  ],
  
  '大学英语': [
    {
      id: 'eng_001',
      title: '英语阅读理解技巧',
      content: '阅读理解的关键策略：1. 先读题目，带着问题阅读文章 2. 找关键词和主题句 3. 注意转折词：however, but, although等 4. 关注首尾段落，通常包含主旨 5. 利用上下文猜测生词含义 6. 区分事实和观点 7. 注意作者态度和语气词。',
      tags: ['阅读', '技巧', '考试'],
      importance: 5
    },
    {
      id: 'eng_002',
      title: '英语写作常用句型',
      content: '开头段：It is widely believed that... / Recently, the issue of... has been brought into public focus. / When it comes to..., some people think... 中间段：First of all, / Moreover, / In addition, / On the one hand, ... on the other hand, ... 结尾段：In conclusion, / To sum up, / From what has been discussed above, we can draw the conclusion that...',
      tags: ['写作', '句型', '模板'],
      importance: 4
    },
    {
      id: 'eng_003',
      title: '常见语法错误及纠正',
      content: '1. 主谓一致：The list of items are/is on the desk. (正确：is) 2. 时态混用：I have seen him yesterday. (错误，应去掉yesterday或改用一般过去时) 3. 冠词使用：I like music. (正确，抽象名词前不用冠词) 4. 介词搭配：interested in, good at, depend on 5. 非谓语动词：I suggest to go/going there. (正确：going)',
      tags: ['语法', '错误', '纠正'],
      importance: 3
    }
  ],
  
  '计算机基础': [
    {
      id: 'cs_001',
      title: '数据结构基础概念',
      content: '数据结构是计算机存储、组织数据的方式。主要类型：1. 线性结构：数组、链表、栈、队列 2. 树形结构：二叉树、B树、堆 3. 图结构：有向图、无向图 4. 散列结构：哈希表。选择数据结构考虑因素：数据规模、操作频率、空间复杂度、时间复杂度。大O表示法：O(1) < O(log n) < O(n) < O(n log n) < O(n²)。',
      tags: ['数据结构', '基础', '算法'],
      importance: 5
    },
    {
      id: 'cs_002',
      title: 'Python编程基础',
      content: 'Python特点：简洁易读、解释型语言、动态类型。基本数据类型：int, float, str, bool, list, dict, tuple, set。控制结构：if-elif-else, for, while循环。函数定义：def function_name(parameters): return value。常用内置函数：len(), range(), print(), input(), type()。列表推导式：[x**2 for x in range(10)]。',
      tags: ['Python', '编程', '基础'],
      importance: 4
    },
    {
      id: 'cs_003',
      title: '计算机网络基础',
      content: 'OSI七层模型：应用层、表示层、会话层、传输层、网络层、数据链路层、物理层。TCP/IP四层模型：应用层、传输层、网络层、网络接口层。常用协议：HTTP(80)、HTTPS(443)、FTP(21)、SSH(22)、DNS(53)、SMTP(25)。IP地址分类：A类(1-126)、B类(128-191)、C类(192-223)。',
      tags: ['网络', '协议', '通信'],
      importance: 4
    }
  ]
};

class OfficialKnowledgeBase {
  constructor() {
    this.knowledge = officialKnowledge;
  }

  search(query, options = {}) {
    const { courseName, limit = 3 } = options;
    const results = [];
    const queryLower = query.toLowerCase();
    
    for (const [course, items] of Object.entries(this.knowledge)) {
      if (courseName && course !== courseName) continue;
      
      for (const item of items) {
        const titleMatch = item.title.toLowerCase().includes(queryLower);
        const contentMatch = item.content.toLowerCase().includes(queryLower);
        const tagMatch = item.tags.some(tag => tag.toLowerCase().includes(queryLower));
        
        if (titleMatch || contentMatch || tagMatch) {
          results.push({
            ...item,
            courseName: course,
            relevance: this.calculateRelevance(queryLower, item)
          });
        }
      }
    }
    
    results.sort((a, b) => b.relevance - a.relevance);
    return results.slice(0, limit);
  }

  calculateRelevance(query, item) {
    let score = 0;
    const titleLower = item.title.toLowerCase();
    const contentLower = item.content.toLowerCase();
    
    if (titleLower.includes(query)) score += 10;
    if (contentLower.includes(query)) score += 5;
    if (item.tags.some(tag => tag.toLowerCase().includes(query))) score += 3;
    score += item.importance || 1;
    
    return score;
  }

  getByCourse(courseName) {
    return this.knowledge[courseName] || [];
  }

  getAll() {
    return this.knowledge;
  }
}

module.exports = new OfficialKnowledgeBase();
