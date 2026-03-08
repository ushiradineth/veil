export class TopKHeap<T> {
  private heap: { item: T; score: number; seq: number }[] = [];
  private readonly k: number;
  private nextSeq = 0;

  constructor(k: number) {
    this.k = k;
  }

  private parent(i: number): number {
    return Math.floor((i - 1) / 2);
  }

  private left(i: number): number {
    return 2 * i + 1;
  }

  private right(i: number): number {
    return 2 * i + 2;
  }

  private swap(i: number, j: number): void {
    const tmp = this.heap[i];
    this.heap[i] = this.heap[j];
    this.heap[j] = tmp;
  }

  private heapifyUp(i: number): void {
    while (i > 0) {
      const p = this.parent(i);
      if (this.compare(this.heap[i], this.heap[p]) >= 0) break;
      this.swap(i, p);
      i = p;
    }
  }

  private heapifyDown(i: number): void {
    for (;;) {
      let smallest = i;
      const l = this.left(i);
      const r = this.right(i);

      if (l < this.heap.length && this.compare(this.heap[l], this.heap[smallest]) < 0) {
        smallest = l;
      }
      if (r < this.heap.length && this.compare(this.heap[r], this.heap[smallest]) < 0) {
        smallest = r;
      }

      if (smallest === i) break;
      this.swap(i, smallest);
      i = smallest;
    }
  }

  private compare(a: { score: number; seq: number }, b: { score: number; seq: number }): number {
    if (a.score !== b.score) return a.score - b.score;
    return b.seq - a.seq;
  }

  insert(item: T, score: number): void {
    if (this.k <= 0) return;
    const entry = { item, score, seq: this.nextSeq++ };
    if (this.heap.length < this.k) {
      this.heap.push(entry);
      this.heapifyUp(this.heap.length - 1);
    } else if (this.compare(entry, this.heap[0]) > 0) {
      this.heap[0] = entry;
      this.heapifyDown(0);
    }
  }

  toSortedArray(): T[] {
    const sorted = [...this.heap].sort((a, b) => {
      if (a.score !== b.score) return b.score - a.score;
      return a.seq - b.seq;
    });
    return sorted.map((entry) => entry.item);
  }
}

export function getLru<K, V>(cache: Map<K, V>, key: K): V | undefined {
  const value = cache.get(key);
  if (value === undefined) return undefined;
  cache.delete(key);
  cache.set(key, value);
  return value;
}

export function setLru<K, V>(cache: Map<K, V>, key: K, value: V, maxSize: number): void {
  if (cache.has(key)) cache.delete(key);
  cache.set(key, value);
  while (cache.size > maxSize) {
    const first = cache.keys().next().value;
    if (first === undefined) break;
    cache.delete(first);
  }
}
