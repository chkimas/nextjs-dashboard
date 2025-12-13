'use server'

import { z } from 'zod'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import postgres from 'postgres'
import { signIn } from '@/auth'
import { AuthError } from 'next-auth'

const sql = postgres(process.env.POSTGRES_URL!, { ssl: 'require' })

const FormSchema = z.object({
  id: z.string(),
  customerId: z.string({
    invalid_type_error: 'Please select a customer.',
    required_error: 'Please select a customer.'
  }),
  amount: z.coerce.number().gt(0, {
    message: 'Please enter an amount greater than $0.'
  }),
  status: z.enum(['pending', 'paid'], {
    invalid_type_error: 'Please select an invoice status.',
    required_error: 'Please select an invoice status.'
  }),
  date: z.string()
})

export type State = {
  errors?: {
    customerId?: string[]
    amount?: string[]
    status?: string[]
  }
  message?: string | null
}

const CreateInvoice = FormSchema.omit({ id: true, date: true })
const UpdateInvoice = FormSchema.omit({ id: true, date: true })

// Create Invoice
export async function createInvoice(prevState: State, formData: FormData) {
  const rawFormData = Object.fromEntries(formData.entries())
  const validatedFields = CreateInvoice.safeParse(rawFormData)

  if (!validatedFields.success) {
    return {
      errors: validatedFields.error.flatten().fieldErrors,
      message: 'Missing Fields. Failed to Create Invoice.'
    }
  }

  const { customerId, amount, status } = CreateInvoice.parse(rawFormData)
  const amountInCents = amount * 100
  const date = new Date().toISOString().split('T')[0]

  try {
    await sql`
    INSERT INTO invoices (customer_id, amount, status, date)
    VALUES (${customerId}, ${amountInCents}, ${status}, ${date})
  `
  } catch (error) {
    // Return an error message to display on the form
    return { message: 'Database Error: Failed to Create Invoice.' }
  }

  revalidatePath('/dashboard/invoices')
  redirect('/dashboard/invoices')
}

// Update Invoice
export async function updateInvoice(
  id: string,
  prevState: State,
  formData: FormData
) {
  const rawFormData = Object.fromEntries(formData.entries())
  const validatedFields = UpdateInvoice.safeParse(rawFormData)

  if (!validatedFields.success) {
    return {
      errors: validatedFields.error.flatten().fieldErrors,
      message: 'Missing Fields. Failed to Update Invoice.'
    }
  }
  const { customerId, amount, status } = UpdateInvoice.parse(rawFormData)
  const amountInCents = amount * 100

  try {
    await sql`
      UPDATE invoices
      SET customer_id = ${customerId}, amount = ${amountInCents}, status = ${status}
      WHERE id = ${id}
    `
  } catch (error) {
    // Return an error message to display on the form
    return { message: 'Database Error: Failed to Update Invoice.' }
  }

  revalidatePath('/dashboard/invoices')
  redirect('/dashboard/invoices')
}

// Delete Invoice
export async function deleteInvoice(id: string) {
  await sql`DELETE FROM invoices WHERE id = ${id}`
  revalidatePath('/dashboard/invoices')
}

// Authentication
export async function authenticate(
  prevState: string | undefined,
  formData: FormData
) {
  try {
    await signIn('credentials', formData)
  } catch (error) {
    if (error instanceof AuthError) {
      switch (error.type) {
        case 'CredentialsSignin':
          return 'Unable to authenticate your login details.'
        default:
          return 'An unexpected error occurred. Please try again later.'
      }
    }
    throw error
  }
}
