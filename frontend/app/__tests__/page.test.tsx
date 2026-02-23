import { render, screen } from './test-utils';
import Home from '../page';

vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: vi.fn(),
  }),
}));

describe('Home', () => {
  it('renders a heading', () => {
    render(<Home />);

    const heading = screen.getByRole('heading', {
      name: /Lingo-IA/i,
    });

    expect(heading).toBeInTheDocument();
  });
});
