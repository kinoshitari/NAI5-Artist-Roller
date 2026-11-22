\# 制作 NAI5 画师串随机工具\
\
请直接制作一个可实际使用的中文网页工具，完成真实画师数据收集、RimWorld 风格界面、随机逻辑、九套质量预设、本地保存和验证。\
\
本工具用于生成与复制提示词。已有项目沿用现有技术栈；空项目采用 React + TypeScript + Vite。数据和静态资源随应用打包，配置与历史保存在浏览器本地，运行时无需连接 NovelAI。兼容电脑和手机。\
\
先阅读项目说明并查看下方真实 UI 样板，再实现。普通实现选择自行处理，持续推进到可运行版本。遇到访问阻塞时记录实际缺项，继续完成其他工作，最终如实报告。\
\
\## 一、默认配置\
\
\- 画师池：V5 收藏前1000。\
\- 画师数量：随机3–6位，包含已锁定画师。\
\- 权重模式：主次分层。\
\- 主画师：1位，权重0.85–1.10。\
\- 辅助画师：权重0.35–0.65。\
\- 点缀画师：权重0.10–0.30。\
\- 总权重：自动。\
\- 质量预设：2.5D精致·中。\
\- 3D强度：0.45。\
\- 3D脸抑制：-0.80。\
\- 年份词：关闭。\
\- 输出默认使用源站原始 tag，提供 artist: 前缀开关。\
\
\## 二、收集真实 V5 画师前1000\
\
\### 数据来源与排名口径\
\
主来源：\
\
https\://tags.gallery/en/v5?s=favorites\
\
榜单定义：TAGs 的 V5 画师候选集，按站内收藏数 FAVS 降序排列，取前1000个去重画师。\
\
名称使用“V5 收藏前1000”，在来源面板注明第三方榜单及采集日期。\
\
字段含义：\
\
\- FAVS：站内收藏数。\
\- POSTS：Danbooru 投稿数。\
\- SCORE：Danbooru 最高分单张作品的得分。\
\
各字段分别保留。\
\
\### 采集要求\
\
\- 读取公开结构化数据或解析公开 HTML。\
\- 确认实际分页，逐页抓取，显式保留 s=favorites。\
\- 使用同一次采集流程，保留来源 URL、源站顺序、采集起止时间及原始响应快照或摘要。\
\- 同票沿用源站顺序，检查跨页重复，去重后取恰好1000条。\
\- 使用 V5 专页，不能拿 V4.5 榜单、其他模型数据或 Danbooru 投稿数榜补成 V5 收藏榜。\
\- 每条至少保存 id、tag、displayName、sourceRank、favorites、sourceUrl、modelEvidence。\
\- 真实取得的 aliases、postCount、topScore 另外保存；缺失值使用 null。\
\- V5 样图依据可记为 v5_gallery_sample，不声称得到官方训练名单。\
\- 保留名称中的括号与限定词，只合并有来源依据的别名。\
\- 输出 artists.v5.top1000.json、CSV、来源说明和可重复运行的更新脚本。\
\- 采用低并发、缓存和退避重试；更新失败保留上一版有效数据。\
\- 应用读取内置快照，ROLL 无需访问源站。\
\- 画师样图通过来源链接查看。\
\- 数据不足或来源受限时保留真实结果，明确实际数量和原因，不造数、不混用排名口径。\
\
\## 三、画师池\
\
内置以下画师池：\
\
\- 前100。\
\- 前300。\
\- 前1000。\
\- 个人收藏。\
\- 自建池。\
\
支持以下操作：\
\
\- 搜索 tag 与真实别名。\
\- 勾选、批量加入或移出画师池。\
\- 个人收藏。\
\- 全局排除。\
\- 自建池的新建、重命名、复制、删除。\
\- 导入与导出。\
\
实际候选集：\
\
\*\*当前池成员－全局排除名单。\*\*\
\
搜索只过滤列表显示，修改成员通过明确操作完成。\
\
所有抽取、单项替换、主画师指定都受当前池约束。\
\
画师池与质量预设独立。用户可手工建立“厚涂池”“2.5D池”；自动风格分类必须有真实依据。\
\
\## 四、数量与主次分层\
\
\### 画师数量\
\
支持：\
\
\- 精确数量 N。\
\- 数量范围 [Nmin,Nmax]。\
\
范围包含端点，数量包含已锁定画师。\
\
最多抽取当前有效池的可用人数，同一结果不重复。\
\
\### 主次模式\
\
人数分配规则：\
\
\- N=1：主1、辅0、点缀0。\
\- N≥2：主1。\
\- 辅助人数 A=ceil((N−1)/3)。\
\- 点缀人数 D=N−1−A。\
\
\| 总人数 | 主画师 | 辅助 | 点缀 | 自动总权重 |\
\| --- | --- | --- | --- | --- |\
\| 1 | 1 | 0 | 0 | 0.95 |\
\| 2 | 1 | 1 | 0 | 1.45 |\
\| 3 | 1 | 1 | 1 | 1.65 |\
\| 4 | 1 | 1 | 2 | 1.85 |\
\| 5 | 1 | 2 | 2 | 2.35 |\
\| 6 | 1 | 2 | 3 | 2.55 |\
\| 10 | 1 | 3 | 6 | 3.65 |\
\
默认权重范围：\
\
\- 主画师：0.85–1.10。\
\- 辅助画师：0.35–0.65。\
\- 点缀画师：0.10–0.30。\
\
每层范围均可编辑。\
\
\*\*默认最多1位画师超过1.0，避免大量画师同时出现1.x权重。\*\*\
\
抽取顺序：\
\
1\. 保留锁定项，确认各层剩余名额。\
2\. 从当前池等概率、无放回抽取其他画师。\
3\. 随机分配剩余层级。\
4\. 在各自范围内生成权重，并满足总权重约束。\
\
收藏数不参与抽中概率，输出权重不决定抽中概率。\
\
输出按主、辅、点缀排列，同层按权重降序显示。\
\
\### 自由随机模式\
\
另提供“自由随机”模式：\
\
\- 全部画师使用共同的权重上下限。\
\- 初始范围0.40–1.20。\
\- 不自动分配主、辅、点缀。\
\- 两种模式分别保存设置。\
\
主次模式以分层范围为主要控件。如提供全局上下限，将其放在高级设置且默认关闭；启用后与各层范围取交集。\
\
有实际使用的层级交集为空时，直接提示冲突。\
\
\## 五、总权重与约束\
\
\### 计算范围\
\
总权重只计算画师权重，必须从画师结果数据求和。\
\
以下内容全部独立，不参与画师总权重：\
\
\- 质量词。\
\- 风格词。\
\- 3d 正权重。\
\- 3d face 负权重。\
\- 年份词。\
\
\### 总权重模式\
\
主次模式提供：\
\
\- 自动。\
\- 不限。\
\- 固定。\
\- 范围。\
\
自由模式提供：\
\
\- 不限。\
\- 固定。\
\- 范围。\
\
自由模式默认“不限”。\
\
\### 自动总权重\
\
公式：\
\
\*\*S=0.95＋0.50×A＋0.20×D。\*\*\
\
默认5人时，总权重为2.35。\
\
合法示例：\
\
\- 主：1.00。\
\- 辅：0.56、0.42。\
\- 点缀：0.23、0.14。\
\- 总和：2.35。\
\
自动模式严格尝试当前公式目标。锁定或修改范围使其不可行时，显示可用总和，并允许用户改为固定、范围或调整设置。\
\
\### 约束处理\
\
\- 不限模式下，各可调整权重在对应范围内随机。\
\- 固定模式严格满足指定总和。\
\- 范围模式在当前人数对应的可行总和区间与用户区间的交集中，随机选取一个总和。\
\- 自由模式的基础约束为 N×L≤S≤N×U。\
\- 主次模式的最低总和是各层人数乘以下限后相加，最高总和同理。\
\- 有锁定权重时，先扣除其数量和权重，再计算其余项的可行范围。\
\- 数量范围模式先检查全部候选人数，再从可行人数中等概率抽取。\
\- 部分人数可行时，简洁显示“可抽数量：……”。\
\- 全部不可行时禁用 ROLL，并显示具体原因。\
\- 内部使用0.01的整数单位，输入、显示、复制保持一致。\
\- 固定总和采用满足各项上下界的随机分配，并随机化分配顺序。\
\- 禁止整体放大、归一化后截断或破坏层级来凑总和。\
\- 非法数值、画师池不足、锁定冲突等显示明确短错误，保留用户输入。\
\
\## 六、锁定与局部调整\
\
每行显示：\
\
\*\*层级、画师名、权重、锁定、替换、收藏。\*\*\
\
操作规则：\
\
\- \*\*锁画师\*\*：保留身份和层级，权重可重掷。\
\- \*\*锁权重\*\*：同时保留身份、层级和权重。\
\- \*\*ROLL\*\*：保留锁定项，重抽其余身份，并重新分配可调整权重。\
\- \*\*重掷权重\*\*：保持全部身份和层级，只修改未锁定权重。\
\- \*\*换一个\*\*：替换该行未锁定身份，保持层级和权重；新画师来自当前池且未在结果中出现。\
\- \*\*只换辅助／点缀\*\*：保留主画师及其权重，替换所选层级中未锁定的身份，保留各位置权重。\
\- \*\*设为主画师\*\*：与现有主画师交换层级。涉及锁定项时提示先解锁；交换后重新分配必要的未锁定权重，满足新层级和总和。\
\- \*\*手动改权重\*\*：先校验当前档位，再在必要时重新分配其他未锁定权重；确认全局约束成立后应用。\
\
修改画师池、数量、模式或范围引发锁定冲突时，明确指出。\
\
缩减人数后容不下已锁定的层级名额，应判定不可行。\
\
\## 七、九套质量预设\
\
\### 选择方式\
\
界面用两组控件选择：\
\
\- 风格：常规／手绘厚涂／2.5D精致。\
\- 长度：短／中／长。\
\
另提供关闭和自建预设。\
\
\### 长度规则\
\
\- 短档：基础质量与核心风格。\
\- 中档：增加光影、材质、色彩。\
\- 长档：细化局部纹理、反射、明暗过渡和边缘。\
\
各档逐层扩展，保持风格一致。\
\
长度只控制描述细度。切换长度时保留画师、权重、3D强度和脸部抑制设置。\
\
预设不绑定人物、服装、动作、构图或场景。\
\
九套预设允许编辑、另存和恢复默认。切换时完整替换旧预设，内部结构化组合以避免重复追加，保留用户有意设置的词序和权重。\
\
\### 2.5D核心模块\
\
正向提示词中同时包含：\
\
0.45::3d ::, -0.80::3d face ::\
\
独立控件：\
\
\- 3D强度默认0.45，建议初始调节范围0.20–0.80。\
\- 3D脸抑制默认-0.80，建议初始调节范围-1.50–-0.30。\
\
这是工具的推荐调节区间，高级编辑可以输入其他有效值，保持3d为正、3d face为负。\
\
这两项独立于画师权重系统。\
\
三种长度都只输出一组核心模块，修改控件时替换相应数值，不能在旧文本后追加第二组。\
\
下方2.5D词串展示默认参数下的完整输出。实现时将两段参数与其余预设正文分开管理，预设编辑与参数控件保持同步。\
\
\### 常规·短\
\
best quality, amazing quality, masterpiece, high complexity, clean details, refined rendering\
\
\### 常规·中\
\
best quality, amazing quality, masterpiece, high complexity, clean details, refined rendering, balanced contrast, clear visual hierarchy, controlled highlights, readable shadows, harmonious color relationships, refined edge treatment, consistent detail density, coherent light and shadow\
\
\### 常规·长\
\
best quality, amazing quality, masterpiece, high complexity, clean details, refined rendering, balanced contrast, clear visual hierarchy, controlled highlights, readable shadows, harmonious color relationships, refined edge treatment, consistent detail density, coherent light and shadow, subtle tonal variation, carefully separated overlapping forms, precise local details, well-resolved silhouettes, nuanced color transitions, balanced light and dark areas, consistent material cues, controlled saturation, selective detail emphasis, smooth transitions where appropriate, crisp focal details, unified rendering across the image, clean separation between adjacent shapes, carefully resolved finishing details\
\
\### 手绘厚涂·短\
\
best quality, masterpiece, painterly, oil painting (medium), visible brushstrokes, textured brushwork, layered paint, rich color variation\
\
\### 手绘厚涂·中\
\
best quality, masterpiece, painterly, oil painting (medium), visible brushstrokes, textured brushwork, layered paint, rich color variation, expressive paint strokes, varied brush sizes, layered color blocks, subtle canvas texture, warm and cool color interplay, controlled hard and soft edges, painterly shading, selective impasto\
\
\### 手绘厚涂·长\
\
best quality, masterpiece, painterly, oil painting (medium), visible brushstrokes, textured brushwork, layered paint, rich color variation, expressive paint strokes, varied brush sizes, layered color blocks, subtle canvas texture, warm and cool color interplay, controlled hard and soft edges, painterly shading, selective impasto, directional brushwork following forms, broken color within brushstrokes, translucent glazing between opaque layers, dry-brush accents, irregular pigment coverage, subtle underpainting, thicker paint in focal accents, varied paint opacity, restrained palette mixing, richly layered midtones, textured shadow edges, selective loss and recovery of edges, unified brush rhythm, carefully resolved painted details\
\
\### 2.5D精致·短\
\
best quality, masterpiece, high complexity, depthness, 0.45::3d ::, -0.80::3d face ::\
\
\### 2.5D精致·中\
\
best quality, masterpiece, high complexity, depthness, 0.45::3d ::, -0.80::3d face ::, detailed lighting, soft shading, subtle reflected light, smooth tonal transitions, delicate textures, refined highlights, layered shadows, clear material definition, soft ambient illumination, controlled specular highlights\
\
\### 2.5D精致·长\
\
best quality, masterpiece, high complexity, depthness, 0.45::3d ::, -0.80::3d face ::, detailed lighting, soft shading, subtle reflected light, smooth tonal transitions, delicate textures, refined highlights, layered shadows, clear material definition, soft ambient illumination, controlled specular highlights, subtle contact shadows, nuanced midtone transitions, material-specific light response, softly graded occlusion, fine surface detail, carefully balanced diffuse and specular lighting, controlled highlight roll-off, subtle color variation within shadows, gentle reflected color, clean transitions between illuminated and shaded areas, refined edge lighting, consistent light direction, selective microtexture, coherent volumetric form\
\
\## 八、输出、历史与备份\
\
\### 输出格式\
\
使用 NAI 数字加权格式，每位画师独立闭合：\
\
0.80::freng ::, 0.65::ixy ::\
\
默认保留源站原始 tag，提供 artist: 前缀开关。开启后例如：\
\
0.80::artist:freng ::, 0.65::artist:ixy ::\
\
避免重复前缀，保留画师名中的括号、空格与必要符号。\
\
\### 复制与组合\
\
提供两个主复制按钮：\
\
\- 复制画师串。\
\- 复制画师＋预设。\
\
后者依次组合：\
\
\*\*画师串＋当前完整预设＋启用的年份词。\*\*\
\
使用英文半角逗号分隔。\
\
若未另行选择重新生成，切换预设、长度、前缀或2.5D参数只更新输出，不重抽画师。\
\
显示实际画师数量和画师总权重，不将画师层级或中文界面标签复制进英文提示词。\
\
年份词独立可选，默认关闭。\
\
\### 历史与保存\
\
\- 保存最近50次结果，支持恢复与收藏。\
\- 历史记录实际画师、层级、权重、完整预设文本、3D参数、种子、配置与数据版本。\
\- 恢复历史使用当时的实际结果。\
\- 来源数据更新或用户改过预设后，历史仍能原样恢复。\
\- 历史恢复不触发重新抽取。\
\- 画师池、收藏、排除名单、参数、自建预设和历史刷新后保留。\
\- 提供带格式版本的完整 JSON 备份与恢复。\
\- 高级区提供可选随机种子。\
\- 相同数据版本、候选池、参数、锁定状态与种子产生相同结果。\
\- 支持 JSON／CSV 导入，校验结构、数值、重复 ID 和别名关系。\
\- 标签内容以文本渲染。\
\- 剪贴板不可用时，提供可选中文本或下载文本的回退方式。\
\
帮助弹窗说明：NovelAI 的 Add Quality Tags 会另外追加词，用户可按需要关闭，以单独比较本工具预设。\
\
\## 九、RimWorld UI：先看样板，再设计\
\
必须实际打开并查看以下截图，先记录简短的参考映射，再继续实现。\
\
\### 画师池与管理\
\
https\://rimworldwiki.com/images/5/57/Apparel_Policies.png\
\
\### 参数与数字控件\
\
https\://rimworldwiki.com/images/6/6f/Work_bill_duster.png\
\
\### 结果表\
\
https\://rimworldwiki.com/images/4/41/WorkTabCustom.png\
\
整体以前两张为主，第三张用于紧凑行式表格。\
\
\### 视觉要求\
\
高度贴近原图的：\
\
\- 深灰窗口。\
\- 灰黑面板。\
\- 直角细边框。\
\- 黄棕浅浮雕按钮。\
\- 紧凑数字框与加减按钮。\
\- 选中行。\
\- 细分隔线。\
\- 滚动条。\
\
配色参考：\
\
\| 元素 | 色值 |\
\| --- | --- |\
\| 背景 | #15191D |\
\| 面板 | #2A2B2C |\
\| 按钮 | #6A512E |\
\| 高光边 | #7D6133 |\
\| 阴影边 | #4F3D22 |\
\| 描边 | #878787 |\
\| 外框 | #616C7A |\
\| 文字 | #E6E6E6 |\
\
使用普通清晰的无衬线字体和系统中文字体，控件通过 CSS 与简单图形重建。\
\
避免大圆角、玻璃背景、霓虹渐变、像素字体和大块装饰留白。\
\
\### 布局与交互\
\
\- 桌面三栏：左侧画师池，中间参数与预设，右侧抽取结果。\
\- 底部放输出与主操作，具体比例以实际截图对照调整。\
\- 风格与长度各用一组短按钮。\
\- 层级在结果行标为“主／辅／点缀”，数字沿列对齐。\
\- 数据来源、种子、导入导出、细分范围等放抽屉或弹窗。\
\- 历史使用可收起面板。\
\- 主界面只保留必要短标签、数值、按钮、锁定状态与错误提示。\
\- 删除宣传副标题、描述性小字、按钮下解释和装饰统计卡片。\
\- 帮助通过可点击入口打开。\
\- 手机改为纵向布局或“画师池／参数／结果”标签页。\
\- ROLL 和复制始终容易触达，触控区域至少44px。\
\
\## 十、验收与交付\
\
\### 数据与算法\
\
1\. 内置1000个真实去重的V5候选画师，来源、排名和采集日期可追溯。\
2\. 默认5人：主1、辅2、点缀2，总和2.35；每项满足所属范围，默认最多1项大于1.0。\
3\. 主次模式5人、固定总和3.60：明确报错，显示可行区间1.75–3.00。\
4\. 自由模式5人、范围0.40–1.20、总和3.60：成功，复制权重相加精确为3.60。\
5\. 默认主次模式，人数3–6、固定总和3.20：只有6人可行，界面说明可抽数量为6。\
6\. 池只有3人却要求4人：报错；排除项、别名重复项不出现在结果中。\
7\. 锁定、设为主、单项替换、只换辅助／点缀、只重掷权重均符合既定规则。\
8\. 相同完整输入与种子可复现；随机结果始终满足数量、分层、上下界与总和约束。\
\
\### 预设与持久化\
\
9\. 九套预设均有完整词串，短中长逐层丰富，切换后不残留旧预设。\
10\. 三套2.5D各包含一次正权重3d和一次负权重3d face，均位于正向输出；切换长度保持参数值。\
11\. 修改3D参数不改变画师总和、不重抽画师。\
12\. 复制与界面一致；刷新、历史恢复和导入导出保留真实结果与用户配置。\
\
\### 界面与交付\
\
13\. 在1440×900、1366×768、390×844实际运行并截图，检查无溢出、遮挡、错位，触控与复制可用。\
14\. 对照RimWorld样板检查面板、按钮、边框、列表密度与字体，完成修正。\
15\. 针对随机约束、锁定、数据去重、导入校验及组合输出编写必要测试，并运行构建验证。\
16\. 交付可运行源码、真实数据、更新脚本、启动与构建命令、验证结果和实际界面截图。\
17\. 明确尚未完成或被阻塞的部分。\
\
\## 官方语法参考\
\
https\://docs.novelai.net/en/image/strengthening-weakening/\
\
https\://docs.novelai.net/en/image/tags/\
\
https\://docs.novelai.net/en/image/qualitytags/\
\
https\://docs.novelai.net/en/image/tutorial-artstyles/