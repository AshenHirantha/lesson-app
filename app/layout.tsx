import "./globals.css";

export const metadata = {
  title: "Learn From Code",
  description: "Drop a code file, get a tailored lesson.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
