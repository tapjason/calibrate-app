import { ICON_IMAGE_PX, __setIconImageDepsForTests, pickIconImage } from './iconImage';

afterEach(() => {
  __setIconImageDepsForTests(null);
  jest.restoreAllMocks();
});

// Roadmap D40: a category's own picture, square and small, or nothing.
describe('pickIconImage', () => {
  it('returns a PNG data URI of the squared, shrunk picture', async () => {
    const squarePng = jest.fn(async () => 'AAAA');
    __setIconImageDepsForTests({
      pick: async () => ({ uri: 'file:///p.jpg', width: 1200, height: 900 }),
      squarePng,
    });
    await expect(pickIconImage()).resolves.toEqual({
      status: 'picked',
      uri: 'data:image/png;base64,AAAA',
    });
    expect(squarePng).toHaveBeenCalledWith(
      { uri: 'file:///p.jpg', width: 1200, height: 900 },
      ICON_IMAGE_PX,
    );
  });

  it('says cancelled when the person closes the library', async () => {
    const squarePng = jest.fn(async () => 'AAAA');
    __setIconImageDepsForTests({ pick: async () => null, squarePng });
    await expect(pickIconImage()).resolves.toEqual({ status: 'cancelled' });
    expect(squarePng).not.toHaveBeenCalled();
  });

  it('fails silently when the picker or the image work throws', async () => {
    jest.spyOn(console, 'warn').mockImplementation(() => {});
    __setIconImageDepsForTests({
      pick: async () => {
        throw new Error('no permission');
      },
      squarePng: async () => 'AAAA',
    });
    await expect(pickIconImage()).resolves.toEqual({ status: 'failed' });
  });
});
