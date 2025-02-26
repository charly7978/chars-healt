import * as React from "react"
import { Slot } from "@radix-ui/react-slot"
import { Controller, ControllerProps, FieldPath, FieldValues, FormProvider } from "react-hook-form"
import { cn } from "../../lib/utils"
import { Label } from "../ui/label"

type FormFieldContextValue<
  TFieldValues extends FieldValues,
  TFieldName extends FieldPath<TFieldValues>
> = {
  label: string
  field: {
    name: TFieldName
    value: TFieldValues[TFieldName]
    onChange: (value: TFieldValues[TFieldName]) => void
    onBlur: () => void
  }
}

const FormFieldContext = React.createContext<
  FormFieldContextValue<any, any>
>({} as FormFieldContextValue<any, any>)

export function Form<TFieldValues extends FieldValues>({
  ...props
}: React.PropsWithChildren<{
  methods: FormProvider<TFieldValues>
}>) {
  return (
    <FormProvider {...props.methods}>
      {props.children}
    </FormProvider>
  )
}

type FormLabelProps = React.HTMLAttributes<HTMLLabelElement>

export function FormLabel({ ...props }: FormLabelProps) {
  return (
    <Label {...props} />
  )
}

type FormDescriptionProps = React.HTMLAttributes<HTMLParagraphElement>

export function FormDescription({ className, ...props }: FormDescriptionProps) {
  return (
    <p
      className={cn("text-sm text-muted-foreground", className)}
      {...props}
    />
  )
}

type FormMessageProps = React.HTMLAttributes<HTMLParagraphElement>

export function FormMessage({ className, ...props }: FormMessageProps) {
  return (
    <p
      className={cn("text-sm font-medium text-destructive", className)}
      {...props}
    />
  )
}

type FormFieldProps<
  TFieldValues extends FieldValues,
  TFieldName extends FieldPath<TFieldValues>
> = {
  control: any
  name: TFieldName
  children: (props: FormFieldContextValue<TFieldValues, TFieldName>) => React.ReactNode
}

export function FormField<
  TFieldValues extends FieldValues,
  TFieldName extends FieldPath<TFieldValues>
>({
  ...props
}: FormFieldProps<TFieldValues, TFieldName>) {
  return (
    <Controller
      control={props.control}
      name={props.name}
      render={({ field }) => (
        <FormFieldContext.Provider value={{ field, label: props.name as string }}>
          {props.children({ field, label: props.name as string })}
        </FormFieldContext.Provider>
      )}
    />
  )
}

type FormControlProps = React.HTMLAttributes<HTMLDivElement>

export function FormControl({ className, ...props }: FormControlProps) {
  return (
    <Slot className={cn("flex flex-col gap-1.5", className)} {...props} />
  )
}
