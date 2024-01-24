export type Listener<T> = (event: T) => void;

export interface Disposable {
  dispose: () => void;
}

// custom event class so we don't need any node_modules
export class Event<T> {
  private listeners: Listener<T>[] = [];
  private listenersOncer: Listener<T>[] = [];

  on(listener: Listener<T>): Disposable {
    this.listeners.push(listener);

    return {
      dispose: () => {
        this.off(listener);
      },
    };
  }

  once(listener: Listener<T>): void {
    this.listenersOncer.push(listener);
  }

  off(listener: Listener<T>): void {
    const callbackIndex = this.listeners.indexOf(listener);

    if (callbackIndex > -1) {
      this.listeners.splice(callbackIndex, 1);
    }
  }

  emit(event: T): void {
    /** Update any general listeners */
    this.listeners.forEach((listener) => {
      listener(event);
    });

    /** Clear the `once` queue */
    if (this.listenersOncer.length > 0) {
      const toCall = this.listenersOncer;
      this.listenersOncer = [];

      toCall.forEach((listener) => {
        listener(event);
      });
    }
  }
}
