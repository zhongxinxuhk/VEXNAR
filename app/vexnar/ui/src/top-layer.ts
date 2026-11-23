// Copyright (c) 2026 xuzhongxin <xuzhongxin@sec.hn.cn>
// Repository: https://github.com/zhongxinxuhk/VEXNAR
// SPDX-License-Identifier: AGPL-3.0-or-later

/**
 * 把第三方插件的整屏遮罩提进浏览器顶层。
 *
 * 现象：dsh-purge 首次安装的「用户须知」弹出后，只有中间会话区变暗，左边栏、
 * 右侧栏和底部状态栏依旧亮着，看上去像给窗口描了一圈边框。
 *
 * 原因不在它写得不好，而在它被挂错了地方：它的遮罩是
 * `.dshp-auth-mask { position: fixed; inset: 0; z-index: 10100 }`，但 DOM 上位于
 * 会话面板内部。面板有自己的层叠上下文与圆角裁剪，`position: fixed` 的 inset
 * 于是按面板算、z-index 10100 也被关在面板这一层里，遮罩只盖住面板本身。
 * 单靠抬 z-index 修不了：面板的裁剪先一步把它裁掉了（我们自己的浮层改用
 * `<dialog>` + `showModal()` 进顶层，正是绕开同一件事，见 components/kit.tsx）。
 *
 * 这里用 Popover API 做外挂修复：给遮罩加 `popover="manual"` 再 `showPopover()`，
 * 元素进 top layer——不参与 z-index 比较，也不受祖先 transform / overflow 影响。
 * 只认列表里的选择器，不做「猜哪个 div 像遮罩」那种事；插件哪天改成顶层弹窗，
 * 这些规则自然失效并且不影响它。
 */

/** 已知会画整屏遮罩的第三方容器。新增插件时把它的遮罩类名加进来即可。 */
const PLUGIN_MASKS = ['.dshp-auth-mask'] as const

const PROMOTED = 'data-vx-top-layer'

type PopoverElement = HTMLElement & { showPopover?: () => void; hidePopover?: () => void }

/**
 * 让一个遮罩进顶层。
 *
 * `[popover]` 的 UA 规则把盒子收成 `fit-content` 并 `margin: auto` 居中，遮罩要的是
 * 一整屏：尺寸交回 `auto`，配合它自己写的 `inset: 0` 让盒子被拉伸到占满视口——
 * 这样插件自带的 `padding: 20px` 才落在盒子内部，而不是把总宽撑出视口。
 */
function promote(element: PopoverElement): void {
  if (element.hasAttribute(PROMOTED)) return
  if (typeof element.showPopover !== 'function') return
  element.setAttribute(PROMOTED, '')
  element.setAttribute('popover', 'manual')
  element.style.inset = '0'
  element.style.width = 'auto'
  element.style.height = 'auto'
  element.style.maxWidth = 'none'
  element.style.maxHeight = 'none'
  element.style.margin = '0'
  try {
    element.showPopover()
  }
  catch {
    // 已经在顶层、或属性被移除：撤销标记，下一次 DOM 变化再试。
    element.removeAttribute(PROMOTED)
    element.removeAttribute('popover')
  }
}

function scan(root: ParentNode): void {
  for (const selector of PLUGIN_MASKS) {
    for (const element of root.querySelectorAll<PopoverElement>(selector)) promote(element)
  }
}

/**
 * 装上提升器。返回的清理函数断开观察者，并把已经提上去的遮罩放回原位。
 */
export function promotePluginMasks(): () => void {
  if (typeof document === 'undefined') return () => {}

  scan(document)
  const observer = new MutationObserver((records) => {
    for (const record of records) {
      for (const node of record.addedNodes) {
        if (node.nodeType !== 1) continue
        const element = node as PopoverElement
        if (PLUGIN_MASKS.some(selector => element.matches(selector))) promote(element)
        scan(element)
      }
    }
  })
  observer.observe(document.body, { childList: true, subtree: true })

  return () => {
    observer.disconnect()
    for (const selector of PLUGIN_MASKS) {
      for (const element of document.querySelectorAll<PopoverElement>(`${selector}[${PROMOTED}]`)) {
        element.hidePopover?.()
        element.removeAttribute(PROMOTED)
        element.removeAttribute('popover')
      }
    }
  }
}
