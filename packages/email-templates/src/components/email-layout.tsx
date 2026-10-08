import {
  Body,
  Container,
  Head,
  Hr,
  Html,
  Preview,
  Section,
  Text,
} from "@react-email/components";
import type { ReactNode } from "react";

import { brand } from "./brand";

/** Which product sends the email; Whiteboard unless the caller says otherwise. */
export type EmailProduct = { name: string; mark: string };

const WHITEBOARD: EmailProduct = { name: "Whiteboard", mark: "W" };

export function EmailLayout({
  preview,
  children,
  product = WHITEBOARD,
}: {
  preview: string;
  children: ReactNode;
  product?: EmailProduct;
}) {
  return (
    <Html lang="en">
      <Head />
      <Preview>{preview}</Preview>
      <Body style={styles.body}>
        <Container style={styles.container}>
          <Section style={styles.header}>
            <Text style={styles.wordmark}>
              <span style={styles.mark}>{product.mark}</span> {product.name}
            </Text>
          </Section>
          <Section style={styles.card}>{children}</Section>
          <Hr style={styles.rule} />
          <Text style={styles.footer}>
            {product.name} sent this email because someone used this address in{" "}
            {product.name}. If that wasn&apos;t you, you can ignore it.
          </Text>
        </Container>
      </Body>
    </Html>
  );
}

const styles = {
  body: {
    backgroundColor: brand.canvas,
    fontFamily: brand.fontFamily,
    margin: 0,
    padding: "32px 0",
  },
  container: {
    maxWidth: "520px",
    margin: "0 auto",
    padding: "0 16px",
  },
  header: {
    padding: "0 0 16px",
  },
  wordmark: {
    color: brand.ink,
    fontSize: "18px",
    fontWeight: 600,
    margin: 0,
  },
  mark: {
    display: "inline-block",
    width: "28px",
    height: "28px",
    lineHeight: "28px",
    borderRadius: "7px",
    backgroundColor: brand.primary,
    color: "#ffffff",
    textAlign: "center" as const,
    marginRight: "6px",
  },
  card: {
    backgroundColor: "#ffffff",
    border: `1px solid ${brand.border}`,
    borderRadius: "14px",
    padding: "28px",
  },
  rule: {
    borderColor: brand.border,
    margin: "24px 0 12px",
  },
  footer: {
    color: brand.muted,
    fontSize: "12px",
    lineHeight: "18px",
    margin: 0,
  },
};
