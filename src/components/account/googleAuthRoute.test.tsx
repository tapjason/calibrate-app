import { render } from '@testing-library/react-native';

import GoogleAuthRedirect from '../../../app/google-auth';

// app/google-auth.tsx (step 192): Google sign-in's return address, in case iOS
// ever opens it as a deep link as well as handing it to the sign-in sheet.
// Tested from here: a test file under app/ could be read as a route.
const mockRouter = { canGoBack: jest.fn(), back: jest.fn(), replace: jest.fn() };
jest.mock('expo-router', () => ({ useRouter: () => mockRouter }));

beforeEach(() => jest.clearAllMocks());

describe('the google-auth route', () => {
  it('draws nothing and goes back to where the person was', () => {
    mockRouter.canGoBack.mockReturnValue(true);
    const { toJSON } = render(<GoogleAuthRedirect />);

    expect(toJSON()).toBeNull();
    expect(mockRouter.back).toHaveBeenCalledTimes(1);
    expect(mockRouter.replace).not.toHaveBeenCalled();
  });

  it('goes to Today on a cold start, with nothing to go back to', () => {
    mockRouter.canGoBack.mockReturnValue(false);
    const { toJSON } = render(<GoogleAuthRedirect />);

    expect(toJSON()).toBeNull();
    expect(mockRouter.replace).toHaveBeenCalledWith('/');
    expect(mockRouter.back).not.toHaveBeenCalled();
  });
});
