class Vue {
    constructor(options) {
        this.$options = options
        this.$data = options.data
        this.$el = options.el
        // 将data添加到响应式系统中
        new Observer(this.$data)
        // 代理
        Object.keys(this.$data).forEach(key => {
            this._proxy(key)
        })
        // 解析el
        new Compiler(this.$el, this)
    }

    // 代理data的属性到Vue上
    _proxy(key) {
        Object.defineProperty(this, key, {
            configurable: true,
            enumerable: true,
            get() {
                return this.$data[key]
            },
            set(newValue) {
                this.$data[key] = newValue
            },
        })
    }
}


class Observer {
    constructor(data) {
        this.data = data
        // 设置响应式逻辑
        Object.keys(this.data).forEach(key => {
            this.defineReactive(this.data, key, this.data[key])
        })
    }

    // 为每个key创建一个Dep对象 并设置setter/getter
    defineReactive(data, key, val) {
        // 每个key都对应一个dep
        const dep = new Dep()
        // 设置setter/getter
        Object.defineProperty(data, key, {
            enumerable: true,
            configurable: true,
            get() {
                // 添加watcher到对应的dep
                if (Dep.target) {
                    dep.addSub(Dep.target)
                }
                return val
            },
            set(newValue) {
                if (newValue === val) {
                    return
                }
                val = newValue
                // value发生变化 通知所有的watcher进行更新
                dep.notify()
            }
        })
    }
}

class Dep {
    constructor() {
        this.subs = []
    }
    // 添加watcher
    addSub(watcher) {
        this.subs.push(watcher)
    }
    // 通知所有的watcher进行update
    notify() {
        this.subs.forEach(item => item.update())
    }
}

const reg = /\{\{(.+)\}\}/
class Compiler {
    constructor(el, vm) {
        this.el = document.querySelector(el)
        this.vm = vm

        this.frag = this._createFragment()

        // 这里添加的是frag的所有子元素 并不是frag本身
        // 添加的是片段的所有子节点 
        // 上面遍历了el的子节点并添加到frag 所以这时el没有了子节点
        // 需要重新添加子节点
        this.el.appendChild(this.frag)
    }
    _createFragment() {
        // 创建一个文档片段
        // 使用文档片段的好处：
        /**
         * 因为文档片段存在于内存中，并不在DOM树中，
         * 它的变化不会触发 DOM 树的重新渲染，且不会导致性能等问题。
         * 所以将子元素插入到文档片段时不会引起页面回流（对元素位置和几何上的计算）。
         * 因此，使用文档片段通常会带来更好的性能。
         * 
         * 最常用的方法是使用文档片段作为参数
         * （例如，任何 Node 接口类似 Node.appendChild 和 Node.insertBefore 的方法），
         * 这种情况下被添加（append）或被插入（inserted）的是片段的所有子节点, 而非片段本身。
         * 因为所有的节点会被一次插入到文档中，而这个操作仅发生一个重渲染的操作，
         * 而不是每个节点分别被插入到文档中，因为后者会发生多次重渲染的操作。
         */
        const frag = document.createDocumentFragment()
        let child
        while (child = this.el.firstChild) {
            this._compile(child)

            /** 
             * appendChild: 将子节点添加到指定父节点的子节点列表的末尾
             * 注意点: 如果被插入的子节点在当前文档的文档树中存在，会先从原来的位置移除 
             * 然后再插入到新的位置
             * 
             * 所以这里的节点会从el中移除 然后在添加到frag中
             * 也就是说当遍历结束 el中就不再有子节点 所以需要再给el添加子节点
             */
            frag.appendChild(child)
        }
        return frag
    }
    _compile(node) {
        if (node.nodeType === Node.ELEMENT_NODE) {// 元素节点

            // Element.attributes 属性返回该元素所有属性节点的一个实时集合
            const attrs = node.attributes
            /**
             * hasOwnProperty() 方法会返回一个布尔值，指示对象自身属性中是否具有指定的属性
             * （也就是，是否有指定的键）
             */
            if (attrs.hasOwnProperty('v-model')) {
                const attr = attrs['v-model']
                // 取出v-model对应的变量名
                const name = attr.nodeValue
                // 监听input事件
                node.addEventListener('input', e => {
                    // 将输入的内容保存 
                    // 同时会触发vm的setter 以此来通知所有的watcher进行update
                    this.vm[name] = e.target.value
                })

                // 创建该节点对应的watcher
                new Watcher(node, name, this.vm)
            }
        } else if (node.nodeType === Node.TEXT_NODE) {// 文本节点
            const nodeValue = node.nodeValue // {{message}}
            if (reg.test(nodeValue)) {
                // 取出{{}}中的名称
                const name = RegExp.$1.trim()
                // 创建该节点对应的watcher
                new Watcher(node, name, this.vm)
            }
        }
    }
}

class Watcher {
    constructor(node, name, vm) {
        this.node = node
        this.name = name
        this.vm = vm

        // 将自身保存 以便在调用data的getter时能添加到dep中
        Dep.target = this
        this.update()
        // 清空target 防止重复添加

        // 这里将watcher赋空 因为后续还会创建其他的watcher 然后保存到新的dep中
        // Dep.watcher = this; 虽然会覆盖原来的watcher 但还是要清空
        // 因为我们添加watcher的时候是根据Dep.watcher是否有值 
        // 如果不清空 那么每次调用getter都会添加watcher 将重复添加watcher
        Dep.target = null
    }

    // 更新视图
    update() {
        if (this.node.nodeType === Node.ELEMENT_NODE) {// 元素节点
            // this.vm[this.name] 会调用getter 这时候Observer中的get方法中，
            // dep就会将watcher保存
            this.node.value = this.vm[this.name]
        } else if (this.node.nodeType === Node.TEXT_NODE) {// 文本节点
            this.node.nodeValue = this.vm[this.name]
        }
    }
}
