import { EventEmitter } from "events";

export type Task<T = any> = () => Promise<T>;

export class PromiseQueue<T> extends EventEmitter {
  public total: number;
  public todo: Task<T>[];
  public running: Task<T>[];
  public complete: Task<T>[];
  public failed: Task<T>[];
  public count: number;
  public results: T[];

  constructor(tasks: Task<T>[] = [], concurrentCount = 1) {
    super();
    this.total = tasks.length;
    this.todo = tasks;
    this.running = [];
    this.complete = [];
    this.failed = [];
    this.results = [];
    this.count = concurrentCount;
  }

  runNext() {
    return this.running.length < this.count && this.todo.length > 0;
  }

  add(tasks: Task<T>[]) {
    this.todo = this.todo.concat(tasks);
    this.total += tasks.length;
    this.run();
  }

  run() {
    while (this.running.length < this.count && this.todo.length > 0) {
      const task = this.todo.shift();

      if (!task) {
        break;
      }

      task()
        .then((result) => {
          this.results.push(result);
          this.complete.push(this.running.shift() as Task);
          this.emit("progress", {
            result: result,
            completed: this.complete.length,
            total: this.total,
          });
        })
        .catch((error) => {
          console.log(error);
          // this.failed.push(this.running.shift() as Task); // TODO add limited retries
        })
        .finally(() => {
          this.run();
        });

      this.running.push(task);
    }

    if (this.complete.length + this.failed.length === this.total) {
      this.emit("complete", { completed: this.results, failed: this.failed });
    }
  }
}
