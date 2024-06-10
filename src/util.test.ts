import { AutoClearMap } from "./util"

describe('AutoClearMap', () => {
  it('reach limit', () => {
    const map = new AutoClearMap();
    map.maxSize = 1;
    map.set(1,1);
    map.set(2,2);
    expect(map.has(1)).toBe(false);
    expect(map.has(2)).toBe(true);
  })
})