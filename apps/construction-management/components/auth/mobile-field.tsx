import type { ComponentProps } from "react";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
  InputGroupText,
} from "@repo/ui/components/input-group";

/** A mobile number with the +91 prefix shown; other countries type +code. */
export function MobileField(props: ComponentProps<typeof InputGroupInput>) {
  return (
    <InputGroup className="h-10">
      <InputGroupAddon>
        <InputGroupText>+91</InputGroupText>
      </InputGroupAddon>
      <InputGroupInput
        type="tel"
        inputMode="tel"
        autoComplete="tel-national"
        placeholder="77081 65767"
        {...props}
      />
    </InputGroup>
  );
}
