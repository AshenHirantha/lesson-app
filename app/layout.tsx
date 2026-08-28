import "./globals.css";

export const metadata = {
  title: "CODE_TERMINAL // The Focused Studio",
  description: "Drop a code file and get a tailored lesson.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
