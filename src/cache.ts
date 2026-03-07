export class TopKHeap<T> {
  private heap: { item: T; score: number }[] = [];
  private readonly k: number;

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
    const temp = this.heap[i]!;
    this.heap[i] = this.heap[j]!;
    this.heap[j] = temp;
  }

  private heapifyUp(i: number): void {
    while (i > 0) {
      const p = this.parent(i);
      if (this.heap[i]!.score >= this.heap[p]!.score) break;
      this.swap(i, p);
      i = p;
    }
  }

  private heapifyDown(i: number): void {
    while (true) {
      let smallest = i;
      const l = this.left(i);
      const r = this.right(i);

      if (l < this.heap.length && this.heap[l]!.score < this.heap[smallest]!.score) {
        smallest = l;
      }
      if (r < this.heap.length && this.heap[r]!.score < this.heap[smallest]!.score) {
        smallest = r;
      }

      if (smallest === i) break;
      this.swap(i, smallest);
      i = smallest;
    }
  }

  insert(item: T, score: number): void {
    if (this.k <= 0) return;
    if (this.heap.length < this.k) {
      this.heap.push({ item, score });
      this.heapifyUp(this.heap.length - 1);
    } else if (score > this.heap[0]!.score) {
      this.heap[0] = { item, score };
      this.heapifyDown(0);
    }
  }

  toSortedArray(): T[] {
    const sorted = [...this.heap].sort((a, b) => b.score - a.score);
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
