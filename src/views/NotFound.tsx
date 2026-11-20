import { PageHero } from "../components/layout/PageHero";
import { Button } from "../components/ui/Button";

export default function NotFound() {
  return (
    <PageHero
      tag="404"
      eyebrow="Page not found"
      title={<>This agent <span className="grad-text">went offline.</span></>}
      lead="The page you're looking for doesn't exist or has moved."
      actions={<>
        <Button to="/" arrow>Back to Home</Button>
        <Button to="/platform" variant="ghost">Explore the Platform</Button>
      </>}
    />
  );
}
