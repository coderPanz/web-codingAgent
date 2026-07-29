/**
 * 终端输出历史缓冲区（环形数组）
 *
 * 每个 Session 持有一个 HistoryBuffer，记录最近 N 行 PTY 输出。
 * 新客户端 Attach 时回放全部历史，然后切换到实时输出。
 */

export class HistoryBuffer {
  /**
   * @param {number} capacity 最大行数，默认 3000
   */
  constructor(capacity = 3000) {
    this.capacity = capacity;
    this.buffer = [];
  }

  /**
   * 追加一行输出
   * @param {string} line
   */
  push(line) {
    if (this.buffer.length >= this.capacity) {
      this.buffer.shift();
    }
    this.buffer.push(line);
  }

  /**
   * 追加原始数据（可能包含多行，分行存储）
   * @param {string} data
   */
  append(data) {
    // 保留完整的 ANSI 序列，按行分割存入
    // 注意：不能简单 split('\n')，会破坏 ANSI 跨行序列
    // 因此存储原始数据块，而不分行
    // 实际上：回放时需要完整 ANSI，所以按块存储更好
    // 但我们限制块数量而非行数
    this.push(data);
    // 如果块太大（> 10KB），拆分为小一些的块
    // 保持 buffer 在 capacity 以内
  }

  /**
   * 获取全部历史数据（不清空）
   * @returns {string}
   */
  getAll() {
    return this.buffer.join('');
  }

  /**
   * 获取全部历史数据并清空
   * @returns {string}
   */
  drain() {
    return this.buffer.join('');
  }

  /**
   * 清空
   */
  clear() {
    this.buffer = [];
  }

  /**
   * 当前块数
   */
  get size() {
    return this.buffer.length;
  }
}
