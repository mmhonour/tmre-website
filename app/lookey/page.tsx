import LookeyClient from "./LookeyClient";

export const metadata = {
  title: "Looked at... — TMRE",
  description:
    "Properties you've viewed across TMRE — saved in your browser as you browse listings.",
};

export default function LookeyPage() {
  return <LookeyClient />;
}
