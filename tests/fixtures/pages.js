/** Realistic DOM fixtures shared by unit tests. */

export const LOGIN_PAGE = `
<header class="site-header"><nav aria-label="Primary"><a href="/">Home</a><a href="/pricing">Pricing</a></nav></header>
<main>
  <form id="login-form" name="login" aria-label="Sign in">
    <h1>Sign in to Acme</h1>
    <label for="email">Email</label>
    <input id="email" name="email" type="email" placeholder="you@example.com" autocomplete="email">
    <label for="password">Password</label>
    <input id="password" name="password" type="password" value="hunter2">
    <label><input type="checkbox" name="remember" value="yes"> Remember me</label>
    <button id="login" type="submit" class="btn btn-primary">Log in</button>
    <a href="/forgot" class="link">Forgot your password?</a>
  </form>
</main>
`;

export const DUPLICATE_BUTTONS_PAGE = `
<main>
  <h2>Team members</h2>
  <table class="members">
    <thead><tr><th>Name</th><th>Role</th><th>Actions</th></tr></thead>
    <tbody>
      <tr><td>Alice Johnson</td><td>Admin</td><td><button class="btn danger">Delete</button></td></tr>
      <tr><td>Bob Smith</td><td>Editor</td><td><button class="btn danger">Delete</button></td></tr>
      <tr><td>Carol White</td><td>Viewer</td><td><button class="btn danger">Delete</button></td></tr>
    </tbody>
  </table>
</main>
`;

export const DUPLICATE_IDS_PAGE = `
<div>
  <button id="save" class="primary">Save draft</button>
  <button id="save" class="secondary">Save and publish</button>
</div>
`;

export const TEST_ID_PAGE = `
<section aria-label="Cart">
  <div data-testid="cart-item-apple" class="cart-item">
    <span class="title">Apple</span>
    <button data-testid="remove" aria-label="Remove Apple">×</button>
  </div>
  <div data-testid="cart-item-pear" class="cart-item">
    <span class="title">Pear</span>
    <button data-testid="remove" aria-label="Remove Pear">×</button>
  </div>
  <button data-testid="checkout-button" class="css-1x2y3z4 sc-AxjAm">Checkout</button>
</section>
`;

export const DYNAMIC_PAGE = `
<div id="ember1234" class="css-a8f3k2 jsx-2391 _3xYzQ">
  <div class="Button_root__a1B2c active">
    <span id="react-select-3-input">Pick one</span>
  </div>
  <button id=":r5:" class="sc-bdVaJa kPZqlS">Continue</button>
</div>
`;

export const QUOTES_PAGE = `
<div>
  <button aria-label="Don't stop">Pause</button>
  <button title='Say "hello"'>Greet</button>
  <a href="/faq">It's "complicated"</a>
  <input name="weird[name].field" placeholder="Search…">
  <div id="1st-item">First</div>
</div>
`;

export const ACCESSIBILITY_PAGE = `
<div>
  <span id="dlg-title">Delete project</span>
  <div role="dialog" aria-labelledby="dlg-title">
    <p>Are you sure?</p>
    <button><svg aria-hidden="true"><path d="M0 0"/></svg><span>Confirm</span></button>
    <button aria-label="Close dialog">X</button>
    <div role="button" tabindex="0">Custom action</div>
  </div>
  <img src="logo.png" alt="Acme logo">
  <img src="spacer.gif" alt="">
  <input type="submit" value="Send message">
  <input type="text" title="Quantity" >
  <label>Country
    <select name="country"><option>Canada</option><option>Mexico</option></select>
  </label>
  <span id="search-label">Search the docs</span>
  <input type="search" aria-labelledby="search-label">
  <button aria-hidden="true">Hidden button</button>
  <button style="display:none">Invisible</button>
  <h2>Pricing <small>(monthly)</small></h2>
</div>
`;
