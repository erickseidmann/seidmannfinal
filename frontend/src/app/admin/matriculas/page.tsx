/**
 * Página Admin: Gerenciar Matrículas
 * 
 * Lista e gerencia matrículas do sistema
 */

'use client'

import AdminHeader from '@/components/admin/AdminHeader'
import { Card } from '@/components/ui/Card'

export default function AdminMatriculasPage() {
  return (
    <>
      <AdminHeader />
      <main className="min-h-screen bg-gradient-to-b from-orange-50 to-white pt-24 pb-20">
        <div className="container mx-auto px-4">
          <div className="max-w-7xl mx-auto">
            <div className="mb-8">
              <h1 className="text-3xl md:text-4xl font-bold text-gray-900 mb-2">
                Gerenciar Matrículas
              </h1>
              <p className="text-sm text-gray-600">
                Visualize e gerencie todas as matrículas do sistema
              </p>
            </div>

            <Card className="p-6">
              <p className="text-gray-600 text-center py-12">
                Página em desenvolvimento. Em breve você poderá gerenciar matrículas aqui.
              </p>
            </Card>
          </div>
        </div>
      </main>
    </>
  )
}
