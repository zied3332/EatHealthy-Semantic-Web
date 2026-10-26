
import { Link } from "react-router-dom";
import {
  ArrowRight,
  Apple,
  BrainCircuit,
  HeartPulse,
  Leaf,
  MessageCircle,
  ShieldCheck,
  Sparkles,
  UserRound,
} from "lucide-react";

import "./Home.css";

const features = [
  {
    title: "My Health Profile",
    description:
      "Explore your health objectives and personalize your nutrition journey.",
    icon: UserRound,
    path: "/profile",
    status: "Coming soon",
  },
  {
    title: "Food Explorer",
    description:
      "Discover foods and explore their categories through semantic data.",
    icon: Apple,
    path: "/foods",
    status: "In development",
  },
  {
    title: "Dietary Preferences",
    description:
      "Explore dietary regimes and discover how food restrictions work.",
    icon: ShieldCheck,
    path: "/diets",
    status: "In development",
  },
  {
    title: "Smart Recommendations",
    description:
      "Get personalized food suggestions based on semantic relationships.",
    icon: Sparkles,
    path: "/recommendations",
    status: "Coming soon",
  },
  {
    title: "AI Nutrition Assistant",
    description:
      "Ask natural-language questions about nutrition and the knowledge graph.",
    icon: MessageCircle,
    path: "/assistant",
    status: "Coming soon",
  },
  {
    title: "Semantic Intelligence",
    description:
      "Discover how ontologies, SPARQL, and knowledge graphs power EatHealthy.",
    icon: BrainCircuit,
    path: "/foods",
    status: "Explore",
  },
];

export default function Home() {
  return (
    <div className="home-page">
      <section className="home-hero">
        <div className="home-hero-content">
          <div className="home-eyebrow">
            <Leaf size={16} />
            SEMANTIC NUTRITION PLATFORM
          </div>

          <h1>
            Eat smarter.
            <br />
            <span>Live healthier.</span>
          </h1>

          <p>
            Discover a smarter approach to nutrition with
            EatHealthy. Explore foods, understand dietary
            preferences, and experience the power of
            semantic knowledge.
          </p>

          <div className="home-hero-actions">
            <Link to="/foods" className="home-btn-primary">
              Explore Foods
              <ArrowRight size={18} />
            </Link>

            <Link to="/recommendations" className="home-btn-secondary">
              Recommendations
            </Link>
          </div>

          <div className="home-hero-note">
            <HeartPulse size={17} />
            Powered by knowledge graphs and semantic technologies
          </div>
        </div>

        <div className="home-hero-visual">
          <div className="home-food-art">
            <div className="home-food-circle">
              <span role="img" aria-label="Healthy meal">
                🥗
              </span>
            </div>
            <div className="home-floating-label">
              <Leaf size={17} />
              Better food choices
            </div>
          </div>
        </div>
      </section>

      <section className="home-features" id="features">
        <div className="home-section-heading">
          <div>
            <div className="home-section-label">
              EXPLORE EATHEALTHY
            </div>
            <h2>Everything you need in one place</h2>
            <p>
              Explore the different modules of our
              semantic nutrition platform.
            </p>
          </div>
        </div>

        <div className="home-features-grid">
          {features.map((feature) => {
            const Icon = feature.icon;

            return (
              <Link
                to={feature.path}
                key={feature.title}
                className="home-feature-card"
              >
                <div className="home-feature-top">
                  <div className="home-feature-icon">
                    <Icon size={23} />
                  </div>
                  <ArrowRight
                    className="home-feature-arrow"
                    size={19}
                  />
                </div>

                <h3>{feature.title}</h3>
                <p>{feature.description}</p>

                <span className="home-feature-status">
                  {feature.status}
                </span>
              </Link>
            );
          })}
        </div>
      </section>

      <section className="home-bottom-banner">
        <div className="home-bottom-icon">
          <BrainCircuit size={28} />
        </div>

        <div>
          <h2>Nutrition meets semantic intelligence</h2>
          <p>
            Built with OWL, RDF, SPARQL, Apache Jena Fuseki,
            FastAPI, and React.
          </p>
        </div>

        <Link to="/foods">
          Start Exploring
          <ArrowRight size={17} />
        </Link>
      </section>
    </div>
  );
}
