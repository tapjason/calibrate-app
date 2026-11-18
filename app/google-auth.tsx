import { useRouter } from 'expo-router';
import { useEffect } from 'react';

/**
 * Where Google sign-in comes back to (`GOOGLE_REDIRECT_URL`,
 * `fairlysure://google-auth`), in case iOS ever delivers it as a deep link
 * too (step 192). It shouldn't: the system sign-in sheet hands that URL back
 * to `signInWithGoogle`, which reads the code there. Without this screen such
 * a link would land on the unmatched-route page.
 *
 * Draws nothing, reads nothing from the link (its code is used once, by the
 * sheet's caller, and never logged), and leaves at once: back to where the
 * person was, or Today on a cold start.
 */
export default function GoogleAuthRedirect() {
  const router = useRouter();

  useEffect(() => {
    if (router.canGoBack()) router.back();
    else router.replace('/' as never);
  }, [router]);

  return null;
}
