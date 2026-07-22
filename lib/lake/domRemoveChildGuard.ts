/**
 * React portal / YouTube iframe / soft-nav 레이스에서
 * `parent.removeChild(child)` 가 parent·child 불일치로 TypeError 나는 것을 막는다.
 * 한 번만 패치.
 */
export function installDomRemoveChildGuard(): void {
  if (typeof Node === 'undefined') return;
  const proto = Node.prototype as Node & { __lhRemoveChildPatched?: boolean };
  if (proto.__lhRemoveChildPatched) return;
  proto.__lhRemoveChildPatched = true;

  const orig = proto.removeChild;
  proto.removeChild = function removeChildPatched<T extends Node>(child: T): T {
    if (!child || child.parentNode !== this) return child;
    try {
      return orig.call(this, child) as T;
    } catch {
      return child;
    }
  };
}
