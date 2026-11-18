-- Texto de boas-vindas do menu, como no contrato da API (docs/endpoint/README.md).
UPDATE passo_roteiro
   SET texto = 'Olá! Sou o assistente Kenko. Como posso ajudar?'
 WHERE codigo_passo = 'menu';
