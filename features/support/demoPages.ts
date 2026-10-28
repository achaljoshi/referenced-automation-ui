/**
 * The small pages some features open, answered at https://app.test/demo/... (see features/steps/fixtures.ts). They are
 * part of the test setup, not of the product: each is just enough page for the behaviour its feature describes.
 * Elements the scenarios read back carry role="status" and a name, so a step finds them the way a user would.
 */

const DIALOGS = `
<button onclick="alert('Saved!'); document.getElementById('out').textContent='after alert'">Alert</button>
<button onclick="document.getElementById('out').textContent = confirm('Delete this order?') ? 'deleted' : 'kept'">Confirm</button>
<span id="out" role="status" aria-label="Result"></span>
`;

const CLOCK = `
<span id="now" role="status" aria-label="Now"></span>
<script>
  const show = () => document.getElementById('now').textContent = new Date().toISOString();
  show(); setInterval(show, 1000);
</script>
`;

const TABS_HOME = '<title>Home</title><a target="_blank" href="/demo/tabs/second">go</a>';
const TABS_SECOND = '<title>Second page</title><h1>Second</h1>';

export const DEMO_PAGES: Record<string, string> = {
  '/demo/dialogs': DIALOGS,
  '/demo/clock': CLOCK,
  '/demo/tabs': TABS_HOME,
  '/demo/tabs/second': TABS_SECOND,
};

/** A profile page that fetches the JSON at the URL in its `?api=` parameter and shows the name in it. Served by a real server (features/steps/fixtures.ts) so the fetch is a genuine cross-origin one. */
export const PROFILE_PAGE = `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8" /><title>Profile</title></head>
<body>
  <div id="profile-name" role="status" aria-label="Profile name">loading...</div>
  <script>
    const target = new URLSearchParams(location.search).get('api');
    fetch(target)
      .then((res) => res.json())
      .then((profile) => { document.getElementById('profile-name').textContent = profile.name; });
  </script>
</body>
</html>`;
