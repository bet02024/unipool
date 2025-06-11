import { render, screen } from '@testing-library/react';
import App from './App';

test('renders Astro Portfolio header', () => {
  render(<App />);
  const linkElement = screen.getByText(/Astro Portfolio/i);
  expect(linkElement).toBeInTheDocument();
});
