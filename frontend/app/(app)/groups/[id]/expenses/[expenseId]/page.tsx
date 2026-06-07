export default function ExpenseDetail({ params }: { params: { id: string, expenseId: string } }) {
  return <div>Expense Detail: {params.expenseId} for Group {params.id}</div>
}
