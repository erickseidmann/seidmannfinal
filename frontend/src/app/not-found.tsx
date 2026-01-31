import Button from '@/components/ui/Button'

export default function NotFound() {
  return (
    <div className="min-h-[60vh] flex flex-col items-center justify-center p-8 text-center">
      <h1 className="text-2xl font-bold text-gray-900 mb-2">Página não encontrada</h1>
      <p className="text-gray-600 mb-6 max-w-md">
        A página que você procura não existe ou foi movida.
      </p>
      <Button variant="primary" href="/">
        Voltar ao início
      </Button>
    </div>
  )
}
