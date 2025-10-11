export interface StoredHistoryOptions {
	maxLength?: number
	items?: string[]
}

export class StoredHistory {
	maxLength: number
	items: string[]

	constructor(options: StoredHistoryOptions = {}) {
		this.maxLength = options.maxLength || 1000
		this.items =
			options.items ||
			JSON.parse(window.localStorage.getItem('history') || '[]')
	}

	push(item: string) {
		this.items.push(item)
		if (this.items.length > this.maxLength) {
			this.items.shift()
		}
		this.persist()
	}

	get length() {
		return this.items.length
	}

	get(index: number) {
		return this.items[index]
	}

	set(index: number, item: string) {
		this.items[index] = item
	}

	shift() {
		const item = this.items.shift()
		this.persist()
		return item
	}

	unshift(item: string) {
		this.items.unshift(item)
		this.persist()
	}

	pop() {
		const item = this.items.pop()
		this.persist()
		return item
	}

	slice(start: number, end: number) {
		return this.items.slice(start, end)
	}

	clear() {
		this.items = []
	}

	persist() {
		window.localStorage.setItem('history', JSON.stringify(this.items))
	}
}
