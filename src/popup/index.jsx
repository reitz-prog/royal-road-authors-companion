import { h, render } from 'preact';

function Popup() {
  return (
    <div style={{ padding: '1rem', minWidth: '200px' }}>
      <h3>RR Author Companion</h3>
      <p>v3.0.0</p>
    </div>
  );
}

render(<Popup />, document.getElementById('app'));
