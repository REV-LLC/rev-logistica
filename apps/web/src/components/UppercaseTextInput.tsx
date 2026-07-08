'use client';

import { forwardRef } from 'react';
import { TextInput, type TextInputProps } from '@mantine/core';

type UppercaseTextInputProps = Omit<TextInputProps, 'onChange'> & {
  onChange?: (value: string) => void;
  transformValue?: (value: string) => string;
};

export function uppercaseInputValue(value: string) {
  return value.toLocaleUpperCase('es-CO');
}

const UppercaseTextInput = forwardRef<HTMLInputElement, UppercaseTextInputProps>(function UppercaseTextInput(
  { onChange, transformValue = uppercaseInputValue, ...props },
  ref,
) {
  return (
    <TextInput
      {...props}
      ref={ref}
      onChange={(event) => {
        onChange?.(transformValue(event.currentTarget.value));
      }}
    />
  );
});

export default UppercaseTextInput;
