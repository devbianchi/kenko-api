/** Clínica como está no banco. O mapeamento para o contrato da API fica no controller. */
export interface ClinicRecord {
  id: number;
  name: string;
  address: string;
  phone: string;
}
